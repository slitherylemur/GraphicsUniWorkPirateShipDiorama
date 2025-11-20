import { loadOBJ } from './obj_loader.js';
import { loadMTL } from './mtl_loader.js';
import { Camera } from './camera.js';
import { Mat4, Vec3 } from './math_utils.js';

async function init() {


    const canvas = document.getElementById('gfx-main');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("WebGPU not supported");
        document.getElementById('info').innerText = "WebGPU not supported on this browser.";
        return;
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    
    context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
    });

    // Depth Texture
    let depthTexture = null;
    function resizeDepth() {
        if (depthTexture) depthTexture.destroy();
        depthTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }
    resizeDepth();
    window.addEventListener('resize', resizeDepth);

    // Load Shader
    const shaderModule = device.createShaderModule({
        label: 'Basic Shader',
        code: await (await fetch('src/shaders.wgsl')).text()
    });

    // Load OBJ
    let objData;
    try {
        objData = await loadOBJ('prepedForCode.obj');
        console.log("OBJ Loaded", objData);
    } catch (e) {
        console.error("Failed to load OBJ", e);
        document.getElementById('info').innerHTML += `<br><span style="color:red">Error loading OBJ: ${e.message}</span>`;
        return;
    }

    // Calculate Bounding Box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    const vData = objData.vertexData;
    for (let i = 0; i < vData.length; i += 8) {
        const x = vData[i];
        const y = vData[i+1];
        const z = vData[i+2];
        
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxDim = Math.max(sizeX, sizeY, sizeZ);
    
    const debugText = `Model Loaded. Verts: ${vData.length/8}. Center: [${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${centerZ.toFixed(2)}] Size: ${maxDim.toFixed(2)}`;
    console.log(debugText);
    document.getElementById('info').innerHTML += `<br><small>${debugText}</small>`;

    // Load Materials
    const materials = {};
    if (objData.materialLibs) {
        for (const lib of objData.materialLibs) {
            const libMats = await loadMTL(lib);
            Object.assign(materials, libMats);
        }
    }
    console.log("Materials Loaded", materials);
    
    // Texture Loader
    const textureCache = new Map();
    
    // Create Default White Texture
    const whiteTexture = device.createTexture({
        size: [1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.writeTexture(
        { texture: whiteTexture },
        new Uint8Array([255, 255, 255, 255]),
        { bytesPerRow: 4 },
        { width: 1, height: 1 }
    );

    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    });

    async function loadTexture(url) {
        if (!url) return whiteTexture;
        if (textureCache.has(url)) return textureCache.get(url);

        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const img = await createImageBitmap(blob);
            
            const texture = device.createTexture({
                size: [img.width, img.height],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });
            
            device.queue.copyExternalImageToTexture(
                { source: img },
                { texture: texture },
                { width: img.width, height: img.height }
            );
            
            textureCache.set(url, texture);
            return texture;
        } catch (e) {
            console.error("Failed to load texture", url, e);
            return whiteTexture;
        }
    }
    
    // Create Vertex Buffer for Object
    const vertexBuffer = device.createBuffer({
        size: objData.vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(objData.vertexData);
    vertexBuffer.unmap();

    // Uniform Buffer (MVP Matrix + Normal Matrix + Params)
    const uniformBufferSize = 144;
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Light Uniform Buffer
    const lightBufferSize = 32 + 16 * 32;
    const lightBuffer = device.createBuffer({
        size: lightBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Bind Group Layout
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: 'filtering' }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: 'float' }
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                buffer: { type: 'uniform' }
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }
        ]
    });

    document.getElementById('info').innerHTML = "<h1>EDINBURGH GROUP 19</h1>";

    // GROUP ASSETS BY ID
    // Structure: { id: string (e.g. "001"), door: Batch, cannon: Batch, explosion: Batch, side: "left"|"right", initialCannonY: number }
    const cannonGroups = new Map();
    
    // Helper to get/create group
    function getCannonGroup(id) {
        if (!cannonGroups.has(id)) {
            cannonGroups.set(id, { id, side: "right" }); // Default right
        }
        return cannonGroups.get(id);
    }

    // Prepare Geometry Batches & Extract Lights
    const batches = [];
    const lights = [];

    for (const geom of objData.geometries) {
        if (geom.indices.length === 0) continue;
        
        // Check if this is a LightLocation placeholder
        if (geom.objectName && geom.objectName.includes("LightLocation")) {
             // Calculate Center of this mesh
            let cx = 0, cy = 0, cz = 0;
            let count = 0;
            for (const idx of geom.indices) {
                cx += vData[idx * 8 + 0];
                cy += vData[idx * 8 + 1];
                cz += vData[idx * 8 + 2];
                count++;
            }
            if (count > 0) {
                lights.push({
                    pos: [cx/count, cy/count, cz/count],
                    color: [1.0, 0.8, 0.2], // Orangy yellow as requested
                    intensity: 3.5 // brightness increased to 3.5
                });
            }
            // SKIP adding this geometry to batches so the cube is invisible
            continue;
        }

        const indices = new Uint32Array(geom.indices);
        const indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Uint32Array(indexBuffer.getMappedRange()).set(indices);
        indexBuffer.unmap();
        
        // Find Material and Texture
        let texture = whiteTexture;
        let color = [1, 1, 1, 1]; // Default white
        
        if (materials[geom.materialName]) {
            const mat = materials[geom.materialName];
            if (mat.map_Kd) {
                texture = await loadTexture(mat.map_Kd);
            }
            if (mat.color) {
                color = [...mat.color, 1.0];
            }
        }
        
        // Create Material Uniform Buffer
        const materialBuffer = device.createBuffer({
            size: 16, // vec4
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(materialBuffer.getMappedRange()).set(color);
        materialBuffer.unmap();
        
        // Create Bind Group for this batch
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: texture.createView() },
                { binding: 3, resource: { buffer: materialBuffer } },
                { binding: 4, resource: { buffer: lightBuffer } }
            ]
        });
        
        batches.push({
            material: geom.materialName,
            objectName: geom.objectName, // Store object name for grouping
            indexBuffer,
            indexCount: indices.length,
            bindGroup,
            modelMatrix: Mat4.create(), // Each batch gets its own model matrix for animation
            customUniformBuffer: null, // Will be created for animated objects
            position: [0,0,0] // Placeholder
        });
    }
    

    // Structure: Map<id, { doors: Batch[], cannons: Batch[], explosion: Batch, side: "left"|"right", doorPivot: Vec3 }>
    const cannonSystem = new Map();

    // IDs: 001, 002, 003 (Right? "door.001")
    // IDs: 004, 005, 006, 007 (Left? "door.004")


    for (const batch of batches) {
        if (!batch.objectName) continue;

        const name = batch.objectName;

        let type = "";
        let id = "000"; // Default ID for unsuffixed

        if (name.toLowerCase().includes("door")) type = "door";
        else if (name.toLowerCase().includes("cannon")) type = "cannon";
        else if (name.toLowerCase().includes("explosion")) type = "explosion";
        else continue; // Not part of cannon system

        // Extract ID
        const match = name.match(/\.(\d{3})/);
        if (match) {
            id = match[1];
        }

        if (!cannonSystem.has(id)) {
            // Determine side based on object name, not ID
            // "cannonLeft" in name means left side, otherwise right
            const side = name.toLowerCase().includes("left") ? "left" : "right";

            cannonSystem.set(id, {
                id,
                side,
                doors: [],  // Array to hold all door parts
                cannons: [], // Array to hold all cannon parts
                explosion: null,
                doorPivot: null, // Will calculate from door vertices
                // Animation State
                state: "idle", // idle, firing, resetting
                timer: 0
            });
        }

        const group = cannonSystem.get(id);

        // Update side if we find "left" in the name (in case door was processed first)
        if (name.toLowerCase().includes("left")) {
            group.side = "left";
        }

        if (type === "door") group.doors.push(batch);
        else if (type === "cannon") group.cannons.push(batch);
        else if (type === "explosion") group.explosion = batch;

        // Create Dynamic Uniform Buffer for this batch to allow animation
        batch.customUniformBuffer = device.createBuffer({
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Get texture and color for material
        let texture = whiteTexture;
        let color = [1,1,1,1];

        // Override color for explosions - bright orange
        if (type === "explosion") {
            color = [10.0, 3.0, 0.0, 1.0]; // Very bright orange (emissive-like)
        }
        else if (materials[batch.material]) {
            const mat = materials[batch.material];
            if (mat.map_Kd) {
                texture = await loadTexture(mat.map_Kd);
            }
            if (mat.color) {
                color = [...mat.color, 1.0];
            }
        }
        
        const materialBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(materialBuffer.getMappedRange()).set(color);
        materialBuffer.unmap();
        
        // RECREATE BIND GROUP to use this new buffer
        batch.bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: batch.customUniformBuffer } }, // Use Custom Buffer
                { binding: 1, resource: sampler },
                { binding: 2, resource: texture.createView() },
                { binding: 3, resource: { buffer: materialBuffer } },
                { binding: 4, resource: { buffer: lightBuffer } }
            ]
        });
        
    }
    
    // Initial Reset
    const CANNON_OFFSET = 2.0;

    function resetCannons() {
        cannonSystem.forEach(group => {
            // Hide explosions
            if (group.explosion) {
                Mat4.identity(group.explosion.modelMatrix);
                group.explosion.modelMatrix[0] = 0;
                group.explosion.modelMatrix[5] = 0;
                group.explosion.modelMatrix[10] = 0;
            }

            // Apply direction multiplier: left side moves negative, right side moves positive
            const direction = (group.side === 'left') ? -1 : 1;
            const cannonOffset = direction * CANNON_OFFSET;
            console.log(`Reset cannon ${group.id}: side=${group.side}, direction=${direction}, offset=${cannonOffset}`);
            group.cannons.forEach(batch => {
                Mat4.identity(batch.modelMatrix);
                batch.modelMatrix[14] += cannonOffset; // Z axis offset
            });

            // Doors - leave them alone (removed door rotation as requested)
            group.doors.forEach(batch => {
                Mat4.identity(batch.modelMatrix);
            });

            // Reset state
            group.state = "idle";
            group.timer = 0;
        });
    }

    // Call reset at initialization
    console.log("=== CANNON SYSTEM SETUP ===");
    cannonSystem.forEach((group, id) => {
        console.log(`Cannon ${id}: side=${group.side}, cannons=${group.cannons.length}, doors=${group.doors.length}, explosion=${group.explosion ? 'yes' : 'no'}`);
    });
    resetCannons();
    console.log("Cannons reset complete");

    console.log(`Extracted ${lights.length} lights from LightLocation objects`, lights);
    
    // Write Light Buffer
    const lightData = new Float32Array(lightBufferSize / 4);
    // Ambient (Boosted to 0.4 as requested)
    lightData[0] = 0.4; lightData[1] = 0.4; lightData[2] = 0.4; lightData[3] = 1.0;
    // Count
    new Uint32Array(lightData.buffer, 16, 1)[0] = lights.length;
    
    let offset = 8; // 32 bytes start (8 floats)
    for (const light of lights) {
        if (offset >= lightData.length) break;
        // Position
        lightData[offset] = light.pos[0];
        lightData[offset+1] = light.pos[1];
        lightData[offset+2] = light.pos[2];
        lightData[offset+3] = 1.0;
        // Color + Intensity
        lightData[offset+4] = light.color[0];
        lightData[offset+5] = light.color[1];
        lightData[offset+6] = light.color[2];
        lightData[offset+7] = light.intensity; // Stored in W
        offset += 8;
    }
    device.queue.writeBuffer(lightBuffer, 0, lightData);


    // Pipeline Layout
    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
    });

    // Render Pipeline (Object)
    const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_main',
            buffers: [{
                arrayStride: 32,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: 'float32x3' }, // Position
                    { shaderLocation: 1, offset: 12, format: 'float32x3' }, // Normal
                    { shaderLocation: 2, offset: 24, format: 'float32x2' }, // UV
                ]
            }]
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [{ format }]
        },
        primitive: {
            topology: 'triangle-list',
            cullMode: 'none'
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
        }
    });

    // Camera
    const camera = new Camera(canvas);
    
    // Auto-center camera
    Vec3.set(camera.target, centerX, centerY, centerZ);
    Vec3.set(camera.position, centerX, centerY + maxDim * 0.5, centerZ + maxDim * 1.5);
    camera.moveSpeed = maxDim * 0.5;
    camera.updateView();
    
    // Matrices
    const modelMatrix = Mat4.create(); 
    const mvpMatrix = Mat4.create();
    const tempMatrix = Mat4.create();
    const skyModelMatrix = Mat4.create();

    // Animation Logic
    // Fire sequence: alternating between left (004-007) and right (000-003)
    const FIRE_SEQUENCE = ["000", "004", "001", "005", "002", "006", "003", "007"];
    let isFiring = false;
    let fireSequenceTime = 0;
    let lastTime = performance.now();
    let debugMode = 0;
    
    const TIME_EXTEND = 2.0;
    const TIME_WAIT = 0.2;
    const TIME_EXPLODE = 0.2;
    const TIME_RETRACT = 0.3;
    const TIME_GAP = 0.3;
    
    // Audio
    const cannonAudio = new Audio('cannonShot.mp3');
    
    function playCannonSound() {
        const sound = cannonAudio.cloneNode();
        sound.volume = 0.5 + Math.random() * 0.5; // Random volume 0.5-1.0
        sound.playbackRate = 0.8 + Math.random() * 0.4; // Random pitch 0.8-1.2
        sound.play().catch(e => console.log("Audio play failed", e));
    }
    
    function triggerFire() {
        if (isFiring) return;
        isFiring = true;
        fireSequenceTime = 0;
        
        // Reset all groups state
        cannonSystem.forEach(g => {
            g.state = "waiting";
            g.timer = 0;
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === '1') debugMode = 0;
        if (e.key === '2') debugMode = 1;
        if (e.key === '3') debugMode = 2;
        
        if (e.key.toLowerCase() === 'f') {
            triggerFire();
        }
    });

    function frame() {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        
        const time = now / 1000;
        
        // Handle Cannon Animation Sequence
        if (isFiring) {
            fireSequenceTime += dt;
            
            // Check triggers for each cannon in sequence
            for (let i = 0; i < FIRE_SEQUENCE.length; i++) {
                const id = FIRE_SEQUENCE[i];
                const startTime = i * TIME_GAP;
                const group = cannonSystem.get(id);
                
                if (group && group.state === "waiting" && fireSequenceTime >= startTime) {
                    group.state = "extending";
                    group.timer = 0;
                }
            }
            
            // Check if all cannons in the sequence are done
            let allSequenceDone = true;
            for (const id of FIRE_SEQUENCE) {
                const group = cannonSystem.get(id);
                if (group && group.state !== "done" && group.state !== "idle") {
                    allSequenceDone = false;
                    break;
                }
            }

            // Reset when all cannons in sequence are done
            if (allSequenceDone) {
                console.log("Fire sequence complete, resetting...");
                isFiring = false;
                resetCannons();
            }
        }
        
        // Update Individual Group Animations
        cannonSystem.forEach(group => {
            if (group.state === "idle" || group.state === "waiting" || group.state === "done") return;
            
            group.timer += dt;
            const t = group.timer;
            
            // 1. Extend: 0 -> TIME_EXTEND
            if (group.state === "extending") {
                // Interpolate Cannon Pos: -OFFSET -> 0
                // Interpolate Door Rot: ROT -> 0
                const p = Math.min(t / TIME_EXTEND, 1.0);
                const smoothP = p * p * (3 - 2 * p); // Smoothstep

                // Cannons - move all parts
                const startOffset = CANNON_OFFSET;
                const direction = (group.side === 'left') ? -1 : 1; // Left side moves in negative direction
                const currentOffset = direction * startOffset * (1.0 - smoothP);
                group.cannons.forEach(batch => {
                    Mat4.identity(batch.modelMatrix);
                    batch.modelMatrix[14] += currentOffset; // Z axis
                });

                // Doors - leave them alone (removed door rotation)
                group.doors.forEach(batch => {
                    Mat4.identity(batch.modelMatrix);
                });

                if (t >= TIME_EXTEND) {
                    group.state = "wait";
                    group.timer = 0;
                }
            }
            // 2. Wait: 0 -> TIME_WAIT
            else if (group.state === "wait") {
                if (t >= TIME_WAIT) {
                    group.state = "exploding";
                    group.timer = 0;
                    // Show Explosion
                    if (group.explosion) {
                        Mat4.identity(group.explosion.modelMatrix); // Reset scale to 1
                    }
                    // Play Sound
                    playCannonSound();
                }
            }
            // 3. Explode: 0 -> TIME_EXPLODE
            else if (group.state === "exploding") {
                // Keep explosion visible
                if (t >= TIME_EXPLODE) {
                    group.state = "retracting";
                    group.timer = 0;
                    // Hide Explosion
                    if (group.explosion) {
                        Mat4.identity(group.explosion.modelMatrix);
                        group.explosion.modelMatrix[0] = 0;
                        group.explosion.modelMatrix[5] = 0;
                        group.explosion.modelMatrix[10] = 0;
                    }
                }
            }
            // 4. Retract: 0 -> TIME_RETRACT
            else if (group.state === "retracting") {
                const p = Math.min(t / TIME_RETRACT, 1.0);
                const smoothP = p * p * (3 - 2 * p);

                // Cannons: 0 -> OFFSET (retracting back)
                const endOffset = CANNON_OFFSET;
                const direction = (group.side === 'left') ? -1 : 1; // Left side moves in negative direction
                const currentOffset = direction * endOffset * smoothP;
                group.cannons.forEach(batch => {
                    Mat4.identity(batch.modelMatrix);
                    batch.modelMatrix[14] += currentOffset; // Z axis
                });

                // Doors - leave them alone (removed door rotation)
                group.doors.forEach(batch => {
                    Mat4.identity(batch.modelMatrix);
                });

                if (t >= TIME_RETRACT) {
                    group.state = "done";
                }
            }
        });

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            resizeDepth();
        }

        camera.update(dt);
        camera.updateProjection(canvas.width / canvas.height);

        // Prepare Object MVP
        Mat4.multiply(tempMatrix, camera.projectionMatrix, camera.viewMatrix);
        Mat4.multiply(mvpMatrix, tempMatrix, modelMatrix);
        
        // Write Object Uniforms
        device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix);
        device.queue.writeBuffer(uniformBuffer, 64, modelMatrix);
        const params = new Float32Array([time, debugMode, 0, 0]);
        device.queue.writeBuffer(uniformBuffer, 128, params);

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.53, g: 0.81, b: 0.92, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            }
        });

        // Draw Objects
        passEncoder.setPipeline(pipeline);
        
        for (const batch of batches) {
            // Update Animation Matrix if available
            const animMatrix = batch.modelMatrix; // Default Identity if not animated
            
            // Combine Global Model Matrix (Rotation) with Local Animation Matrix
            // MVP = Proj * View * GlobalModel * LocalAnim
            
            Mat4.multiply(tempMatrix, camera.projectionMatrix, camera.viewMatrix);
            
            // Global Model Matrix (Identity currently)
            const globalModel = modelMatrix; 
            
            // Final Model Matrix for this batch
            const finalModel = Mat4.create();
            Mat4.multiply(finalModel, globalModel, animMatrix);
            
            const finalMVP = Mat4.create();
            Mat4.multiply(finalMVP, tempMatrix, finalModel);
            
         
            
            let bufferToBind = uniformBuffer;
            
            if (batch.customUniformBuffer) {
                bufferToBind = batch.customUniformBuffer;
                // Update it
                device.queue.writeBuffer(bufferToBind, 0, finalMVP);
                device.queue.writeBuffer(bufferToBind, 64, finalModel);
                device.queue.writeBuffer(bufferToBind, 128, params);
            }
            
            passEncoder.setBindGroup(0, batch.bindGroup);
            
            passEncoder.setVertexBuffer(0, vertexBuffer);
            passEncoder.setIndexBuffer(batch.indexBuffer, 'uint32');
            passEncoder.drawIndexed(batch.indexCount);
        }
        
        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
    console.log("WebGPU Render Loop Started");
}

init();
