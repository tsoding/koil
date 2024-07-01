const RADIUS = 100;

export class State {
    posX: number;
    posY: number;
    velX: number;
    velY: number;
    constructor() {
        this.posX = RADIUS;
        this.posY = RADIUS;
        this.velX = 200;
        this.velY = 200;
    }

    update(ctx: CanvasRenderingContext2D, deltaTime: number) {
        const newPosX = this.posX + this.velX*deltaTime;
        if (newPosX - RADIUS < 0 || newPosX + RADIUS >= ctx.canvas.width) {
            this.velX = -this.velX
        } else {
            this.posX = newPosX;
        }

        const newPosY = this.posY + this.velY*deltaTime;
        if (newPosY - RADIUS < 0 || newPosY + RADIUS >= ctx.canvas.height) {
            this.velY = -this.velY
        } else {
            this.posY = newPosY;
        }

        ctx.fillStyle = "#181818";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.fillStyle = "red";
        ctx.fillRect(this.posX - RADIUS, this.posY - RADIUS, RADIUS*2, RADIUS*2);
    }
}

// interface State {
//     posX: number;
//     posY: number;
//     velX: number;
//     velY: number;
// }

// export function createState(): State {
//     return {
//         posX: RADIUS,
//         posY: RADIUS,
//         velX: 200,
//         velY: 200,
//     }
// }

// export function updateState(ctx: CanvasRenderingContext2D, state: State, deltaTime: number) {
//     const newPosX = state.posX + state.velX*deltaTime;
//     if (newPosX - RADIUS < 0 || newPosX + RADIUS >= ctx.canvas.width) {
//         state.velX = -state.velX
//     } else {
//         state.posX = newPosX;
//     }

//     const newPosY = state.posY + state.velY*deltaTime;
//     if (newPosY - RADIUS < 0 || newPosY + RADIUS >= ctx.canvas.height) {
//         state.velY = -state.velY
//     } else {
//         state.posY = newPosY;
//     }

//     ctx.fillStyle = "#181818";
//     ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

//     ctx.fillStyle = "blue";
//     ctx.fillRect(state.posX - RADIUS, state.posY - RADIUS, RADIUS*2, RADIUS*2);
// }
