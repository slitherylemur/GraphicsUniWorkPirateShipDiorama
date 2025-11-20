export async function loadOBJ(url) {
    const response = await fetch(url);
    const text = await response.text();
    
    const positions = [];
    const normals = [];
    const texcoords = [];
    
    // { materialName: string, objectName: string, indices: [] }
    const geometries = []; 
    let currentGeometry = null;
    const materialLibs = [];
    
    let currentObjectName = '_default';
    let currentMaterialName = '_default';
    
    // Helper to add vertex
    const finalVertices = []; // Interleaved [x, y, z, nx, ny, nz, u, v]
    const indexMap = new Map(); // "v/vt/vn" -> finalIndex
    
    function getVertex(vIdx, vtIdx, vnIdx) {
        const key = `${vIdx}/${vtIdx}/${vnIdx}`;
        if (indexMap.has(key)) {
            return indexMap.get(key);
        }
        
        const idx = finalVertices.length / 8;
        indexMap.set(key, idx);
        
        // Positions
        const p = positions[vIdx - 1];
        finalVertices.push(p[0], p[1], p[2]);
        
        // Normals
        if (vnIdx !== undefined && vnIdx > 0 && normals[vnIdx-1]) {
            const n = normals[vnIdx - 1];
            finalVertices.push(n[0], n[1], n[2]);
        } else {
            finalVertices.push(0, 1, 0); // Default normal
        }
        
        // UVs
        if (vtIdx !== undefined && vtIdx > 0 && texcoords[vtIdx-1]) {
            const t = texcoords[vtIdx - 1];
            finalVertices.push(t[0], 1 - t[1]); // Flip V
        } else {
            finalVertices.push(0, 0);
        }
        
        return idx;
    }
    
    function ensureGeometry() {
        if (currentGeometry && 
            currentGeometry.materialName === currentMaterialName && 
            currentGeometry.objectName === currentObjectName) {
            return;
        }
        
        currentGeometry = { 
            materialName: currentMaterialName, 
            objectName: currentObjectName,
            indices: [] 
        };
        geometries.push(currentGeometry);
    }

    const lines = text.split('\n');
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        
        const parts = line.split(/\s+/);
        const type = parts[0];
        
        if (type === 'v') {
            positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
        } else if (type === 'vn') {
            normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
        } else if (type === 'vt') {
            texcoords.push([parseFloat(parts[1]), parseFloat(parts[2])]);
        } else if (type === 'mtllib') {
            materialLibs.push(parts[1]);
        } else if (type === 'o') {
            currentObjectName = parts[1];
            // o directive implies new object, but Faces (f) are what really matters for batching
            // We update the name for subsequent faces
        } else if (type === 'usemtl') {
            currentMaterialName = parts[1];
            ensureGeometry();
        } else if (type === 'f') {
            ensureGeometry();
            
            const faceVerts = parts.slice(1);
            const triangles = [];
            for (let i = 1; i < faceVerts.length - 1; i++) {
                 triangles.push([faceVerts[0], faceVerts[i], faceVerts[i+1]]);
            }
            
            for (const tri of triangles) {
                for (const vertStr of tri) {
                    const vParts = vertStr.split('/');
                    const vIdx = parseInt(vParts[0]);
                    const vtIdx = vParts[1] ? parseInt(vParts[1]) : 0;
                    const vnIdx = vParts[2] ? parseInt(vParts[2]) : 0;
                    
                    const idx = getVertex(vIdx, vtIdx, vnIdx);
                    currentGeometry.indices.push(idx);
                }
            }
        }
    }
    
    return {
        vertexData: new Float32Array(finalVertices),
        geometries,
        materialLibs
    };
}
