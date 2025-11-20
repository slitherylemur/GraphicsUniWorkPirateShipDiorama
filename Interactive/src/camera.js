import { Mat4, Vec3 } from './math_utils.js';

export class Camera {
    constructor(canvas) {
        this.position = Vec3.set(Vec3.create(), 0, 5, 10);
        this.target = Vec3.set(Vec3.create(), 0, 0, 0);
        this.up = Vec3.set(Vec3.create(), 0, 1, 0);
        
        this.viewMatrix = Mat4.create();
        this.projectionMatrix = Mat4.create();
        
        this.yaw = -Math.PI / 2;
        this.pitch = 0;
        
        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
        
        this.moveSpeed = 10;
        this.lookSpeed = 2;

        this.updateView();
    }
    
    update(dt) {
        const speed = this.moveSpeed * dt;
        const rotateSpeed = this.lookSpeed * dt;
        
        // Rotation (Arrows)
        if (this.keys['ArrowLeft']) this.yaw -= rotateSpeed;
        if (this.keys['ArrowRight']) this.yaw += rotateSpeed;
        if (this.keys['ArrowUp']) this.pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.pitch + rotateSpeed));
        if (this.keys['ArrowDown']) this.pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.pitch - rotateSpeed));

        // Calculate Forward vector based on Yaw/Pitch
        const forward = Vec3.create();
        forward[0] = Math.cos(this.pitch) * Math.cos(this.yaw);
        forward[1] = Math.sin(this.pitch);
        forward[2] = Math.cos(this.pitch) * Math.sin(this.yaw);
        Vec3.normalize(forward, forward);

        const right = Vec3.create();
        Vec3.cross(right, forward, this.up);
        Vec3.normalize(right, right);

        // Movement (WASD)
        if (this.keys['KeyW']) {
            const move = Vec3.create();
            Vec3.scale(move, forward, speed);
            Vec3.add(this.position, this.position, move);
        }
        if (this.keys['KeyS']) {
            const move = Vec3.create();
            Vec3.scale(move, forward, speed);
            Vec3.subtract(this.position, this.position, move);
        }
        if (this.keys['KeyA']) {
            const move = Vec3.create();
            Vec3.scale(move, right, speed);
            Vec3.subtract(this.position, this.position, move);
        }
        if (this.keys['KeyD']) {
            const move = Vec3.create();
            Vec3.scale(move, right, speed);
            Vec3.add(this.position, this.position, move);
        }
        if (this.keys['KeyQ']) {
             this.position[1] += speed;
        }
        if (this.keys['KeyE']) {
             this.position[1] -= speed;
        }
        if (this.keys['KeyR']) {
             // Reset logic would be external or we store initial state
        }

        // Update target for LookAt
        Vec3.add(this.target, this.position, forward);
        
        this.updateView();
    }
    
    updateView() {
        Mat4.lookAt(this.viewMatrix, this.position, this.target, this.up);
    }
    
    updateProjection(aspect) {
        Mat4.perspective(this.projectionMatrix, Math.PI / 4, aspect, 0.1, 1000.0);
    }
}

