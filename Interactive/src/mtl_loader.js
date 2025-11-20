export async function loadMTL(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        
        const materials = {};
        let currentMaterial = null;
        
        const lines = text.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#')) continue;
            
            const parts = line.split(/\s+/);
            const type = parts[0];
            
            if (type === 'newmtl') {
                currentMaterial = { name: parts[1], color: [1, 1, 1], emissive: [0, 0, 0], map_Kd: null };
                materials[currentMaterial.name] = currentMaterial;
            } else if (type === 'Kd') {
                if (currentMaterial) {
                    currentMaterial.color = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                }
            } else if (type === 'Ke') {
                if (currentMaterial) {
                    currentMaterial.emissive = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
                }
            } else if (type === 'map_Kd') {
                 if (currentMaterial) {
                    currentMaterial.map_Kd = parts[1];
                 }
            } else if (type === 'map_Ns') {
                 // Infer color map from roughness map if map_Kd is missing
                 // heuristic for this specific project structure
                 if (currentMaterial && !currentMaterial.map_Kd) {
                     // wood_0038_1k_9YtXtE\wood_0038_roughness_1k.jpg -> wood_0038_1k_9YtXtE\wood_0038_color_1k.jpg
                     let path = parts[1];
                     if (path.includes('roughness')) {
                         path = path.replace('roughness', 'color');
                         // Fix backslashes to forward slashes
                         path = path.replace(/\\/g, '/');
                         currentMaterial.map_Kd = path;
                     }
                 }
            }
        }
        return materials;
    } catch (e) {
        console.warn("Failed to load MTL", url, e);
        return {};
    }
}

