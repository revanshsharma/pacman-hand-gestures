// Gesture controls with MediaPipe Hands (preferred) and a motion-only fallback.

let webcamEl = null;
let toggleBtn = null;
let fallbackEl = null;
let statusEl = null;
let gesturesEnabled = false;
let stream = null;

// motion fallback
let motionCanvas = null;
let motionCtx = null;
let prevFrame = null;
let motionInterval = null;
let overlay = null;
let overlayCtx = null;

// MediaPipe refs
let mediaPipeLoaded = false;
let HandsClass = null;
let CameraClass = null;
let hands = null;
let mpCamera = null;

const MOTION_THRESHOLD = 48;
const MIN_MOTION_COUNT = 40;
const COOLDOWN = 300;
let lastDetectionTime = 0;

// simple smoothing buffer for mediapipe gestures
const recentGestures = [];
const MAX_RECENT = 6;
const REQUIRED_STABLE = 3;

function setStatus(text){ if (statusEl) statusEl.textContent = text; }
function onDirection(dir){ console.log('onDirection', dir); if (window.pacman) window.pacman.updateDirection(dir); }

function enableFallbackButtons(){ if (!fallbackEl) return; fallbackEl.style.display=''; const up = document.getElementById('btn-up'); const left = document.getElementById('btn-left'); const down = document.getElementById('btn-down'); const right = document.getElementById('btn-right'); if(up) up.addEventListener('click',()=>onDirection('U')); if(left) left.addEventListener('click',()=>onDirection('L')); if(down) down.addEventListener('click',()=>onDirection('D')); if(right) right.addEventListener('click',()=>onDirection('R')); }

async function startWebcam(){ try{ stream = await navigator.mediaDevices.getUserMedia({video:{width:640,height:480}}); webcamEl.srcObject = stream; webcamEl.play().catch(()=>{}); webcamEl.style.display=''; return true; }catch(e){ console.warn('webcam failed', e); setStatus('Webcam unavailable'); return false; } }
function stopWebcam(){ if (stream){ for (const t of stream.getTracks()) t.stop(); stream=null;} if (webcamEl) webcamEl.style.display='none'; }

// ---- Motion fallback (unchanged) ----
function startMotion(){ if (!webcamEl) return; if (!motionCanvas){ motionCanvas = document.createElement('canvas'); motionCanvas.width = 160; motionCanvas.height = 120; motionCtx = motionCanvas.getContext('2d'); }
    prevFrame = null; if (motionInterval) clearInterval(motionInterval);
    motionInterval = setInterval(()=>{
        try{
            motionCtx.drawImage(webcamEl,0,0,motionCanvas.width,motionCanvas.height);
            const img = motionCtx.getImageData(0,0,motionCanvas.width,motionCanvas.height);
            const data = img.data; let sumX=0,sumY=0,count=0;
            if (prevFrame){ for (let i=0;i<data.length;i+=4){ const diff = Math.abs(data[i]-prevFrame[i]) + Math.abs(data[i+1]-prevFrame[i+1]) + Math.abs(data[i+2]-prevFrame[i+2]); if (diff > MOTION_THRESHOLD){ const px = ((i/4) % motionCanvas.width); const py = Math.floor((i/4)/motionCanvas.width); sumX+=px; sumY+=py; count++; } } if (count > MIN_MOTION_COUNT){ const cx = sumX/count; const cy = sumY/count; const dx = cx - motionCanvas.width/2; const dy = cy - motionCanvas.height/2; const now = performance.now(); if (now - lastDetectionTime > COOLDOWN){ if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 15){ onDirection(dx>0 ? 'R':'L'); setStatus('Motion: '+(dx>0?'R':'L')); lastDetectionTime = now; if (overlayCtx) drawLabel('Motion: '+(dx>0?'R':'L')); } else if (Math.abs(dy) > 15){ onDirection(dy>0 ? 'D':'U'); setStatus('Motion: '+(dy>0?'D':'U')); lastDetectionTime = now; if (overlayCtx) drawLabel('Motion: '+(dy>0?'D':'U')); } } } }
            prevFrame = new Uint8ClampedArray(data);
        }catch(e){ console.warn('motion error', e); }
    }, 120);
}
function stopMotion(){ if (motionInterval){ clearInterval(motionInterval); motionInterval = null; } }

function drawLabel(text){ if (!overlayCtx) return; overlayCtx.clearRect(0,0,overlay.width,overlay.height); overlayCtx.fillStyle='rgba(0,0,0,0.6)'; overlayCtx.fillRect(0,0,overlay.width,20); overlayCtx.fillStyle='white'; overlayCtx.font='12px sans-serif'; overlayCtx.fillText(text,6,14); }

// ---- MediaPipe integration ----
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=()=>res(); s.onerror=(e)=>rej(e); document.head.appendChild(s); }); }

async function loadMediaPipe(){ if (mediaPipeLoaded) return true; try{
    // try loading core MediaPipe modules from jsdelivr
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
    // classes exposed globally by the scripts
    HandsClass = window.Hands || window.Hands; // defensive
    CameraClass = window.Camera || window.Camera; // camera_utils
    mediaPipeLoaded = !!(HandsClass && CameraClass);
    return mediaPipeLoaded;
}catch(e){ console.warn('mediapipe load failed', e); mediaPipeLoaded=false; return false; } }

function stopMediaPipe(){ try{ if (mpCamera && mpCamera.stop) mpCamera.stop(); mpCamera=null; }catch(e){} if (hands){ if (hands.close) hands.close(); hands=null; } }

function recognizeGestureFromLandmarks(landmarks){
    // landmarks are normalized [0..1] coords
    if (!landmarks || landmarks.length===0) return null;
    // quick helpers: for index/middle/ring/pinky compare tip.y vs pip.y
    const wrist = landmarks[0];
    const idxTip = landmarks[8], idxPip = landmarks[6];
    const midTip = landmarks[12], midPip = landmarks[10];
    const ringTip = landmarks[16], ringPip = landmarks[14];
    const pinkTip = landmarks[20], pinkPip = landmarks[18];
    const thumbTip = landmarks[4], thumbMcp = landmarks[2];

    const indexExt = idxTip.y < idxPip.y;
    const middleExt = midTip.y < midPip.y;
    const ringExt = ringTip.y < ringPip.y;
    const pinkyExt = pinkTip.y < pinkPip.y;
    const thumbLen = Math.hypot(thumbTip.x - thumbMcp.x, thumbTip.y - thumbMcp.y);
    const thumbExt = thumbLen > 0.04; // tuned conservatively

    // Gesture rules (prefer explicit patterns):
    // - Open hand (all fingers extended) => RIGHT
    // - Peace sign (index+middle extended, others folded) => LEFT
    // - Thumbs up (thumb extended, other fingers folded, thumb tip above wrist) => UP
    // - Thumbs down (thumb extended, other fingers folded, thumb tip below wrist) => DOWN

    // Open hand
    if (indexExt && middleExt && ringExt && pinkyExt && thumbExt) return 'R';
    // Peace sign
    if (indexExt && middleExt && !ringExt && !pinkyExt) return 'L';
    // Thumbs up / down
    const otherFingersFolded = (!indexExt && !middleExt && !ringExt && !pinkyExt);
    if (thumbExt && otherFingersFolded){
        if (thumbTip.y < wrist.y - 0.02) return 'U';
        if (thumbTip.y > wrist.y + 0.02) return 'D';
    }
    return null;
}

function handleMpResults(results){
    if (!overlayCtx) return; overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length===0) { drawLabel('No hand'); recentGestures.push(null); if (recentGestures.length>MAX_RECENT) recentGestures.shift(); return; }
    const lm = results.multiHandLandmarks[0];
    // draw small dots for feedback (if drawing_utils available it could be used)
    overlayCtx.fillStyle='rgba(255,255,255,0.9)'; for (const p of lm){ overlayCtx.fillRect(p.x*overlay.width-2, p.y*overlay.height-2,4,4); }
    const g = recognizeGestureFromLandmarks(lm);
    recentGestures.push(g); if (recentGestures.length>MAX_RECENT) recentGestures.shift();
    // check if last REQUIRED_STABLE entries agree and are non-null
    const tail = recentGestures.slice(-REQUIRED_STABLE);
    const allSame = tail.length===REQUIRED_STABLE && tail.every(v=>v===tail[0] && v!==null);
    if (allSame){ const dir = tail[0]; const now = performance.now(); if (now - lastDetectionTime > COOLDOWN){ onDirection(dir); setStatus('MP: '+dir); drawLabel('MP: '+dir); lastDetectionTime = now; recentGestures.length=0; } }
}

async function startMediaPipe(){ if (!webcamEl) return false; const ok = await loadMediaPipe(); if (!ok) return false;
    // instantiate Hands
    hands = new HandsClass({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    hands.setOptions({maxNumHands:1, modelComplexity:1, minDetectionConfidence:0.6, minTrackingConfidence:0.5});
    hands.onResults(handleMpResults);

    // Camera from camera_utils
    try{
        mpCamera = new CameraClass(webcamEl, {
            onFrame: async ()=>{ await hands.send({image: webcamEl}); },
            width: 640, height: 480
        });
        mpCamera.start();
        return true;
    }catch(e){ console.warn('mp camera start failed', e); return false; }
}

// ---- Enable / Disable gestures (tries MediaPipe first, falls back) ----
async function enableGestures(){ if (gesturesEnabled) return; gesturesEnabled = true; setStatus('Starting webcam...'); const ok = await startWebcam(); if (!ok){ enableFallbackButtons(); return; }
    // Try MediaPipe first
    setStatus('Loading MediaPipe...'); const mpOk = await startMediaPipe(); if (mpOk){ setStatus('MediaPipe gestures active'); enableFallbackButtons(); return; }
    // fallback to motion-only
    setStatus('MediaPipe unavailable, using motion fallback'); startMotion(); enableFallbackButtons(); }

function disableGestures(){ gesturesEnabled = false; stopWebcam(); stopMotion(); stopMediaPipe(); setStatus('Disabled'); }

function initUI(){ webcamEl = document.getElementById('webcam'); toggleBtn = document.getElementById('toggle-gestures'); fallbackEl = document.getElementById('gesture-fallback'); statusEl = document.getElementById('gesture-status'); if (!overlay){ overlay = document.createElement('canvas'); overlay.width = 320; overlay.height = 240; overlay.style.position='fixed'; overlay.style.right='10px'; overlay.style.bottom='10px'; overlay.style.width='160px'; overlay.style.height='120px'; overlay.style.zIndex=1001; overlay.style.pointerEvents='none'; document.body.appendChild(overlay); overlayCtx = overlay.getContext('2d'); } if (toggleBtn) toggleBtn.addEventListener('click', async ()=>{ if(!gesturesEnabled){ await enableGestures(); toggleBtn.textContent='Disable Gesture Controls'; } else { disableGestures(); toggleBtn.textContent='Enable Gesture Controls'; } }); enableFallbackButtons(); setStatus('Ready'); window._gesture={enableGestures,disableGestures}; }

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', initUI); else initUI();
