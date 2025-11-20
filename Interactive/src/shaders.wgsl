struct Uniforms {
    modelViewProjectionMatrix : mat4x4<f32>,
    normalMatrix : mat4x4<f32>,
    time : f32,
    debugMode : f32, // 0: Default, 1: Normals, 2: UVs
    padding1 : f32,
    padding2 : f32,
}

struct MaterialUniforms {
    color : vec4<f32>,
}

struct PointLight {
    position : vec4<f32>,
    color : vec4<f32>, // rgb, intensity in w
}

struct LightUniforms {
    ambient : vec4<f32>,
    lightCount : vec4<u32>, // x: count, yzw: padding
    lights : array<PointLight, 16>, // Support up to 16 lights
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var mySampler : sampler;
@group(0) @binding(2) var myTexture : texture_2d<f32>;
@group(0) @binding(3) var<uniform> material : MaterialUniforms;
@group(0) @binding(4) var<uniform> lighting : LightUniforms;

struct VertexInput {
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) uv : vec2<f32>,
};

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) vNormal : vec3<f32>,
    @location(1) vUV : vec2<f32>,
    @location(2) vPos : vec3<f32>,
};

@vertex
fn vs_main(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;
    
    var pos = input.position;
    
    output.Position = uniforms.modelViewProjectionMatrix * vec4<f32>(pos, 1.0);
    
    let normalWorld = uniforms.normalMatrix * vec4<f32>(input.normal, 0.0);
    output.vNormal = normalize(normalWorld.xyz);
    
    output.vUV = input.uv;
    output.vPos = pos;
    return output;
}

@fragment
fn fs_main(input : VertexOutput) -> @location(0) vec4<f32> {
    let normal = normalize(input.vNormal);
    
    // Directional Light (Sun) - Boosted angle/intensity
    // Sun shining from top-right-ish
    let sunDir = normalize(vec3<f32>(0.5, 0.8, 0.5));
    // Ambient boosted slightly in combination with this
    let sunDiffuse = max(dot(normal, sunDir), 0.0) * 0.8; 
    
    var totalLight = vec3<f32>(0.0);
    totalLight += lighting.ambient.rgb;
    totalLight += vec3<f32>(1.0, 0.98, 0.9) * sunDiffuse;
    
    // Point Lights
    for (var i = 0u; i < lighting.lightCount.x; i++) {
        let light = lighting.lights[i];
        let lightPos = light.position.xyz;
        let lightVec = lightPos - input.vPos;
        let dist = length(lightVec);
        let lightDir = normalize(lightVec);
        
        // Attenuation (Inverse Square Law)
        // Standard formula: 1.0 / (constant + linear * dist + quadratic * dist * dist)
        // To make range clearer: 
        // intensity 40 with 1.0 / (dist*dist) falls off VERY fast.
        // Let's use a simpler falloff that is easier to tune:
        // max(0, 1 - dist/range)
        // But physically based:
        let atten = 1.0 / (1.0 + 0.2 * dist + 0.05 * dist * dist);
        
        let diff = max(dot(normal, lightDir), 0.0);
        
        // Combine: LightColor * Intensity * Attenuation * Diffuse
        let intensity = light.color.w;
        let color = light.color.rgb;
        
        totalLight += color * intensity * atten * diff;
    }
    
    let texColor = textureSample(myTexture, mySampler, input.vUV);
    let baseColor = texColor.rgb * material.color.rgb;
    
    var finalColor = baseColor * totalLight;
    
    // Debug Modes
    if (uniforms.debugMode > 0.5 && uniforms.debugMode < 1.5) {
        finalColor = normal * 0.5 + 0.5;
    } else if (uniforms.debugMode > 1.5) {
        finalColor = vec3<f32>(input.vUV, 0.0);
    }
    
    return vec4<f32>(finalColor, 1.0);
}

struct SkyVertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) vUV : vec2<f32>,
};

@vertex
fn vs_sky(input : VertexInput) -> SkyVertexOutput {
    var output : SkyVertexOutput;
    output.Position = uniforms.modelViewProjectionMatrix * vec4<f32>(input.position, 1.0);
    output.vUV = input.uv;
    return output;
}

@fragment
fn fs_sky(input : SkyVertexOutput) -> @location(0) vec4<f32> {
    return textureSample(myTexture, mySampler, input.vUV);
}
