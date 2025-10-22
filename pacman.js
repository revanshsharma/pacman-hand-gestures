//board
let board;
const rowCount = 21;
const columnCount = 19;
const tileSize = 32;
const boardWidth = columnCount * tileSize;
const boardHeight = rowCount * tileSize;
let context;

//images
let blueGhostImage;
let orangeGhostImage;
let pinkGhostImage;
let redGhostImage;
let pacmanUpImage;
let pacmanDownImage;
let pacmanLeftImage;
let pacmanRightImage;
let wallImage;

//X = wall, O = skip, P = pacman, ' ' = food
//Ghosts: b = blue, o = orange, p = pink, r = red

const tileMap = [
    "XXXXXXXXXXXXXXXXXXX",
    "X        X        X",
    "X XX XXX X XXX XX X",
    "X                 X",
    "X XX X XXXXX X XX X",
    "X    X       X    X",
    "XXXX XXXX XXXX XXXX",
    "OOOX X       X XOOO",
    "XXXX X XXrXX X XXXX",
    "O       bpo       O",
    "XXXX X XXXXX X XXXX",
    "OOOX X       X XOOO",
    "XXXX X XXXXX X XXXX",
    "X        X        X",
    "X XX XXX X XXX XX X",
    "X  X     P     X  X",
    "XX X X XXXXX X X XX",
    "X    X   X   X    X",
    "X XXXXXX X XXXXXX X",
    "X                 X",
    "XXXXXXXXXXXXXXXXXXX" 
];



const walls = new Set();
const foods = new Set();
const ghosts = new Set();
let pacman;

const directions = ['U', 'D', 'L', 'R'];
let score = 0;
let lives = 3;
let gameOver = false;

window.onload = function() {
    board = document.getElementById("board");
    board.height = boardHeight;
    board.width = boardWidth;
    context = board.getContext("2d"); // used for drawing on the board

    loadImages();
    loadMap();
    //console.log(walls.size);
    //console.log(foods.size);
    //console.log(ghosts.size);
    for (let ghost of ghosts.values()) {
        const newDirection = directions[Math.floor(Math.random() * 4)];
        ghost.updateDirection(newDirection);
    }
    update();
    document.addEventListener("keyup", movePacman);
}


function loadImages() {
    wallImage = new Image();
    wallImage.src = "./wall.png";

    blueGhostImage = new Image();
    blueGhostImage.src = "./blue.gif";
    orangeGhostImage = new Image();
    orangeGhostImage.src = "./orange.gif";
    pinkGhostImage = new Image();
    pinkGhostImage.src = "./pink.gif";
    redGhostImage = new Image();
    redGhostImage.src = "./red.gif";

    pacmanUpImage = new Image();
    pacmanUpImage.src = "./pacup.png";
    pacmanDownImage = new Image();
    pacmanDownImage.src = "./pacdown.png";
    pacmanLeftImage = new Image();
    pacmanLeftImage.src = "./pacleft.png";
    pacmanRightImage = new Image();
    pacmanRightImage.src = "./pacright.png";
}

function loadMap() {
    walls.clear();
    foods.clear();
    ghosts.clear();

    for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < columnCount; c++) {
            const row = tileMap[r];
            const tileMapChar = row[c];

            const x = c * tileSize;
            const y = r * tileSize;

            if (tileMapChar === "X") {//block wall
                const wall = new Block(wallImage, x, y, tileSize, tileSize);
                walls.add(wall);
            }
            else if (tileMapChar == 'b') {//blue ghost
                const ghost = new Block(blueGhostImage, x, y, tileSize, tileSize);
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'o') {//orange ghost
                const ghost = new Block(orangeGhostImage, x, y, tileSize, tileSize);
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'p') {//pink ghost
                const ghost = new Block(pinkGhostImage, x, y, tileSize, tileSize);
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'r') {//red ghost
                const ghost = new Block(redGhostImage, x, y, tileSize, tileSize);
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'P') {//pacman
                pacman = new Block(pacmanRightImage, x, y, tileSize, tileSize);
                // expose to window so external controllers (gestures) can call updateDirection
                window.pacman = pacman;
            }
            else if (tileMapChar == ' ') {//food
                const food = new Block(null, x + 14, y + 14, 4, 4);
                foods.add(food);
            }

        }
    }
}

function update() {
    if (gameOver) {
        return;
    }
    move();
    draw();
    setTimeout(update, 50); //20 FPS 1 -> 1000ms/20 = 50
}

function draw() {
    context.clearRect(0, 0, boardWidth, boardHeight);
    context.drawImage(pacman.image, pacman.x, pacman.y, pacman.width, pacman.height);
    for (let ghost of ghosts.values()) {
        context.drawImage(ghost.image, ghost.x, ghost.y, ghost.width, ghost.height);
    }
    for (let wall of walls.values()) {
        context.drawImage(wall.image, wall.x, wall.y, wall.width, wall.height);
    }
    context.fillStyle = "white";
    for (let food of foods.values()) {
        context.fillRect(food.x, food.y, food.width, food.height);
    }

    //score
    context.fillStyle = "white";
    context.font = "14 px Press Start 2P";
    if (gameOver){
        context.fillText("Game Over " + String(score), tileSize/2, tileSize/2);
    }
    else {
        context.fillText("x" + String(lives)+ " " + String(score), tileSize/2, tileSize/2);
   }
}
function move() {
    pacman.x += pacman.velocityX;
    pacman.y += pacman.velocityY;

    //check wall collision
    for (let wall of walls.values()) {
        if (collision(pacman, wall)) {
            //move back
            pacman.x -= pacman.velocityX;
            pacman.y -= pacman.velocityY;
            break;
        }
    }

    for (let ghost of ghosts.values()) {
        if (collision(ghost, pacman)) {
            lives -= 1;
            if (lives == 0) {
                gameOver = true;
                return;
            }
            resetPositions();
        }

        if (ghost.y == tileSize*9 && ghost.direction != 'U' && ghost.direction != 'D') {
            ghost.updateDirection('U');
        }

        ghost.x += ghost.velocityX;
        ghost.y += ghost.velocityY;
        for (let wall of walls.values()) {
            if (collision(ghost, wall) || ghost.x < 0 || ghost.x + ghost.width > boardWidth) {
                //move back
                ghost.x -= ghost.velocityX;
                ghost.y -= ghost.velocityY;
                const newDirection = directions[Math.floor(Math.random() * 4)];
                ghost.updateDirection(newDirection);
            }
    }
}

//check food collision
let foodEaten = null;
for (let food of foods.values()) {
    if (collision(pacman, food)) {
        foodEaten = food;
        score += 10;
        break;
    }
}
foods.delete(foodEaten);

//next level
if (foods.size == 0) {
    loadMap();
    resetPositions();
}
}

function movePacman(e) {
    if (gameOver) {
        loadMap();
        resetPositions();
        lives = 3;
        score = 0;
        gameOver = false;
        update();
        return;
    }
    if (e.code == "ArrowUp" || e.code == "KeyW") {
        pacman.updateDirection('U');
    } else if (e.code == "ArrowDown" || e.code == "KeyS") {
        pacman.updateDirection('D');
    } else if (e.code == "ArrowLeft" || e.code == "KeyA") {
        pacman.updateDirection('L');
    } else if (e.code == "ArrowRight" || e.code == "KeyD") {
        pacman.updateDirection('R');
    }

    //update pacman images
    if (pacman.direction == 'U') {
        pacman.image = pacmanUpImage;
    }
    else if (pacman.direction == 'D') {
        pacman.image = pacmanDownImage;
    }
    else if (pacman.direction == 'L') {
        pacman.image = pacmanLeftImage;
    }
    else if (pacman.direction == 'R') {
        pacman.image = pacmanRightImage;
    }
}

function collision(a, b) {
    return  a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
}

function resetPositions() {
    pacman.reset();
    pacman.velocityX = 0;
    pacman.velocityY = 0;
    for (let ghost of ghosts.values()) {
        ghost.reset();
        const newDirection = directions[Math.floor(Math.random() * 4)];
        ghost.updateDirection(newDirection);
    }   

}

class Block {
    constructor(image, x, y, width, height) {
        this.image = image;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;

        this.startX = x;
        this.startY = y;

        this.direction = 'R';
        this.velocityX = 0;
        this.velocityY = 0;
    }

    updateDirection(direction) {
        const prevDirection = this.direction;
        this.direction = direction;
        this.updateVelocity();
        this.x += this.velocityX;
        this.y += this.velocityY;

        // If this block is the global pacman, update its image to match direction
        try {
            if (window && window.pacman === this) {
                if (this.direction == 'U') this.image = pacmanUpImage;
                else if (this.direction == 'D') this.image = pacmanDownImage;
                else if (this.direction == 'L') this.image = pacmanLeftImage;
                else if (this.direction == 'R') this.image = pacmanRightImage;
            }
        } catch (e) {
            // ignore if images or window not available yet
        }

        for (let wall of walls.values()) {
            if (collision(this, wall)) {
                //revert direction
                this.x -= this.velocityX;
                this.y -= this.velocityY;
                this.direction = prevDirection;
                this.updateVelocity();
                return;
            }
        }
    }

    updateVelocity() {
        if (this.direction == 'U') {
            this.velocityX = 0;
            this.velocityY = -tileSize / 4;
        }
        else if (this.direction == 'D') {
            this.velocityX = 0;
            this.velocityY = tileSize / 4;
        }
        else if (this.direction == 'L') {
            this.velocityX = -tileSize / 4;
            this.velocityY = 0;
        }
        else if (this.direction == 'R') {
            this.velocityX = tileSize / 4;
            this.velocityY = 0;
        }
    }

    reset() {
        this.x = this.startX;
        this.y = this.startY;
    }
}