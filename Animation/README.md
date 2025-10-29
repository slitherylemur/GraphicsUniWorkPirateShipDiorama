# Final Video:
https://youtu.be/4eb80auFASg

# Graphics Coursework: Animation Section unreal engine
## Overview

For the animation component of our graphics coursework, we built upon the existing 3D assets created for our pirate ship render. Our goal was to bring these static models to life inside Unreal Engine, showcasing motion, interactivity, and cinematic presentation through animation and visual effects.

## Importing and Setup in Unreal Engine

To begin, we imported all of our 3D objects, including the ship, cannons, mast, and wheel, into Unreal Engine.
This process required careful adjustment of object positions, re-making materials, and scaling, as the transition from Blender to Unreal often introduced inconsistencies.

We encountered a significant issue with Nanite, Unreals mesh optimization feature. When enabled, Nanite decimated several of our models, reducing detail and causing visual artifacts. To solve this, we selectively disabled Nanite for certain meshes to preserve the intended level of detail.

Once all objects were functioning properly, we moved on to creating the animations.

## Animation Process
### Camera Animation

Using Unreals Sequencer, we created a camera animation to frame our diorama dynamically. The camera moves smoothly through the scene, highlighting key areas of the ship that we wanted to then show objects in motion in.

### Object Animations

We used the Sequencer to animate several ship components:

Steering Wheel and Rudder: We animated the ships wheel and linked it to the rudder movement, creating a sense of mechanical connection and purpose.

Cannon Doors: Each door was animated to open in sequence as the camera moved by. with the cannons also moved to stick out of the window at the same time.

We also added an event trigger in the sequencer to hook into firing cannons and made them move back as if experiencing recoil.

These animations were synchronized to create a believable sequence of ship actions.

## Cannon Fire Effects

We really wanted to fire the cannons.
To achieve this we turned the cannon into a blueprint class that also contained a particle effect, a point light and a cannon ball. we then had an event based trigger that would enable these in such a way to look like firing and also make the ball move.
This setup was controlled through the Sequencer by hooking its event calls to triggering the classes fire.
This system worked quite well as we were able to duplicate the cannon blueprint class and each instance contained the ability to be triggered into a firing effect which was necessary as we wanted to fire an entire row of cannons.

## Creative Intent

Most of the ideas for how the video should be actually came from the objects themselves. We thought of the doors opening as we created the cannon door models and the cannons lended themselves to being fired. We also felt the wheel had to move and it would make sense for the rudder to move alongside it. 
The camera movement was designed such that we could fit each of these ideas together in 1 movement and took a bit of messing about with to get right.
Overall, the animation was designed to make the pirate ship scene feel alive, cinematic, and game-ready, emphasizing movement and atmosphere over realism.

