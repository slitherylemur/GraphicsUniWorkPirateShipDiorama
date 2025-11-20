# Graphics Coursework: Interactive Section

# To run the interactive sequence
cd to the Interactive folder
run: **python -m http.server 8000** (can be a different port)

## Overview

For the interactive component of our graphics coursework, we created a real-time 3D viewer using WebGPU that lets users explore our pirate ship model and trigger cannon firing effects. This builds on the Blender render and Unreal animation by adding direct user interaction and control.


## Features

### Camera Controls

We implemented an interactive camera system that lets users explore the ship from any angle using the keyboard and added ui icons to explain the controls

### Lighting

The scene has 2 point lights that were placed in Blender using placeholder objects. These "LightLocation" markers get parsed during loading, their positions are extracted for the lighting calculations, and then they're hidden from view. The lighting uses a simple Phong-style diffuse model with ambient light to keep things visible even in shadow.

### Cannon Firing Animation

The main interactive feature is the cannon firing system, triggered by pressing the F key. When fired, all eight cannons (four on each side) fire in an alternating sequence with slight delays between each one.

Each cannon goes through several animation states:
- Extending: The cannon slides forward out of its port over 2 seconds
- Waiting: A brief 0.2 second pause
- Exploding: A bright orange explosion mesh appears for 0.2 seconds with a synchronized sound effect
- Retracting: The cannon slides back into the ship over 0.3 seconds

Each cannon is delayed by 0.3 seconds from the previous one, creating a rippling effect down both sides of the ship.


## Implementation Details

### Cannon System Structure

We organized cannons into groups by ID, where each group contains:
- Multiple cannon mesh parts (some cannons are made of 2+ separate objects)
- Associated door meshes (though we ended up not animating these due to complications on where there origin was)
- An explosion effect mesh
- A side designation (left or right)

The system automatically detects which side each cannon is on by looking for "left" in the object name. Cannons 004-007 are on the left side, while 000-003 are on the right.

### Animation System

Each cannon group has its own state machine and timer. During the frame loop, we update each cannon's timer and smoothly interpolate its position based on which state it's in. 

Left and right cannons move in opposite directions along the Z axis. right side cannons move with a positive offset, left side cannons with a negative offset. This ensures they all retract properly into their respective sides of the ship.

The explosion effect is just a mesh that gets scaled to zero when hidden, then scaled back to normal size when visible. We gave it a very bright orange emissive color to make it look like a muzzle flash.



### Debouncing

The firing sequence takes several seconds to complete, and we needed to prevent the user from triggering another fire while one was already running. We initially used a time-based check, but this didn't always work reliably. We switched to checking whether all the cannons had reached their "done" state, which was more reliable and allowed the sequence to be triggered again as soon as it finished.

## Creative Intent

We thought it fitting for our project to give users control over its weapons. Being able to fire the cannons at will makes exploring the model more engaging than just looking at it and makes this section fit in with our unreal engine section in which we also displkayed firing cannons.

The camera controls let users position themselves wherever they want to get the best view of the cannons firing, whether that's from the side to see the full sequence, or from the front/back to see both sides at once.

## Collaboration

The interactive section involved:
- Exporting and preparing the Blender model for web use
- Building the WebGPU rendering pipeline and camera system
- Implementing the cannon animation system through multiple iterations
- Debugging coordinate systems, side detection, and animation timing
- Testing and refining the firing sequence to make it feel right


## assets
free cannon sound from:  https://pixabay.com/sound-effects/search/cannon/
keyboard icons from pack: https://itch.io/s/159488/pixelart-keyboard-keys-icons-32x32