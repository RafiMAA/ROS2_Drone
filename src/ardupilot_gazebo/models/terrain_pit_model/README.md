# terrain_pit_model – Gazebo / ROS 2 Setup
===========================================

## Folder Structure
  terrain_pit_model/
  ├── model.config          – Gazebo model manifest
  ├── model.sdf             – SDF 1.9 model definition
  ├── meshes/
  │   ├── terrain.obj       – 1500×1500×5 m terrain (pit boolean-cut)
  │   ├── terrain.mtl       – references grass_color.png
  │   ├── trees.obj         – 350 trees joined (low-poly proxies)
  │   └── trees.mtl
  └── textures/
      ├── grass_color.png   – 2048×2048 baked albedo (Cycles)
      └── grass_roughness.png – 2048×2048 baked roughness

## Installation (ROS 2 / Gazebo Harmonic or Classic)

1.  Copy the entire `terrain_pit_model/` folder to your Gazebo model path:
        ~/.gazebo/models/                     # Gazebo Classic
        ~/.gz/models/                         # Gazebo Sim (Harmonic/Ionic)
    Or add its parent folder to GZ_SIM_RESOURCE_PATH / GAZEBO_MODEL_PATH.

2.  Reference in your world SDF:
        <include>
          <uri>model://terrain_pit_model</uri>
          <pose>0 0 0 0 0 0</pose>
        </include>

3.  Or load from the command line:
        gz sim -r my_world.sdf

## Units & Coordinate Frame
- 1 Blender unit = 1 metre  ✓
- Terrain centred at world origin (0, 0, 0)  ✓
- Z-up, Y-forward (matches ROS 2 / Gazebo convention)  ✓
- Terrain top surface at Z = +2.5 m (terrain spans Z = -2.5 … +2.5)

## Texture Masks
- Grass is masked to XY-radius > 420 m (smooth feather 380–420 m).
- Inside the 400 m pit (radius < 380 m) – bare/dark, no grass.
- Procedural noise gives dark-to-light green colour + roughness 0.6–0.9.
- Bump normal from fine noise (scale 5.5) simulates grass blade texture.

## Physics Note
- Terrain collision uses a simplified 1500×1500×5 box for performance.
- Replace with the mesh URI in <collision> if precise pit-edge physics needed:
      <mesh><uri>model://terrain_pit_model/meshes/terrain.obj</uri></mesh>
