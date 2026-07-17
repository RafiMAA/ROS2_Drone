<p align="center">
  <img src="https://img.shields.io/badge/ROS_2-Jazzy-blue?style=for-the-badge&logo=ros&logoColor=white" alt="ROS 2 Jazzy"/>
  <img src="https://img.shields.io/badge/ArduPilot-SITL-orange?style=for-the-badge&logo=drone&logoColor=white" alt="ArduPilot SITL"/>
  <img src="https://img.shields.io/badge/Gazebo-Harmonic-green?style=for-the-badge" alt="Gazebo Harmonic"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+"/>
</p>

# 🚁 ROS2 Drone — Autonomous Bathymetric Survey System

An autonomous drone system built on **ROS 2 Jazzy**, **ArduPilot SITL**, and **Gazebo Harmonic** that performs **bathymetric surveys** — mapping underwater terrain depth and computing water volume — through a real-time **React-based Ground Control Station (GCS)**.

The drone navigates a user-defined survey grid, classifies each point as **water** or **soil** using computer vision, descends a sonar sensor into detected water bodies to measure depth, and generates a 3D visualization of the underwater topography with volume estimates.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **🗺️ Interactive GCS** | Real-time 2D map canvas with waypoint planning, drag-and-drop mission control, and live drone telemetry |
| **📡 Live Telemetry** | Continuous position, altitude, heading, flight mode, and battery data streamed over ROS 2 → WebSocket |
| **🔍 Surface Classification** | HSV color-thresholding on a gimbal camera feed to distinguish water from soil in real time |
| **📏 Sonar Depth Sensing** | Boom-mounted sonar descends into water bodies, measures depth to the lakebed |
| **🧮 Volume Computation** | Automatic water volume and fill-percentage calculation from the survey grid |
| **📊 3D Bathymetry View** | Interactive Three.js visualization of the scanned underwater terrain |
| **🎯 Autonomous Survey** | State-machine-driven mission: GUIDED flight → classify → descend → measure → ascend → next waypoint → RTL |
| **🎮 Gimbal Control** | Automated gimbal pitch-down during survey for nadir camera/sonar alignment |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Gazebo Harmonic (Simulation)                  │
│  ┌───────────┐  ┌──────────────┐  ┌─────────┐  ┌────────────────┐  │
│  │ Iris Drone │  │ Gimbal Camera│  │  Sonar  │  │ Overhead Camera│  │
│  └─────┬─────┘  └──────┬───────┘  └────┬────┘  └───────┬────────┘  │
└────────┼───────────────┼───────────────┼────────────────┼───────────┘
         │ ArduPilot      │ gz.msgs       │ gz.msgs        │ gz.msgs
         │ JSON           │               │                │
┌────────┼───────────────┼───────────────┼────────────────┼───────────┐
│        ▼               ▼               ▼                ▼           │
│   ┌─────────┐   ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│   │ MAVROS  │   │  GZ-ROS2   │  │  GZ-ROS2   │  │  GZ-ROS2   │     │
│   │         │   │  Bridge    │  │  Bridge    │  │  Bridge    │     │
│   └────┬────┘   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │
│        │              │               │                │            │
│   ┌────┴────────────┐ │          ┌────┴──────┐   ┌────┴──────┐     │
│   │  Bathymetric    │ │          │  Sonar    │   │  Capture  │     │
│   │  Survey Node    │◄┼──────────│  Depth    │   │  Map Node │     │
│   │  (State Machine)│ │          │  Node     │   └───────────┘     │
│   └────┬────────────┘ │          └───────────┘                      │
│        │         ┌────┴────────┐                                    │
│        │         │  Surface    │         ROS 2 Jazzy                │
│        ├────────►│  Classifier │                                    │
│        │         │  Node       │                                    │
│        │         └─────────────┘                                    │
│   ┌────┴──────────┐                                                 │
│   │  rosbridge    │ ◄── WebSocket (port 9090)                       │
│   │  WebSocket    │                                                 │
│   └────┬──────────┘                                                 │
└────────┼────────────────────────────────────────────────────────────┘
         │
    ┌────┴──────────────────────────────────────┐
    │            React GCS (Browser)            │
    │  ┌────────────┐  ┌──────────────────────┐ │
    │  │ Control    │  │ DroneMapCanvas       │ │
    │  │ Panel      │  │ (2D Map + Waypoints) │ │
    │  ├────────────┤  ├──────────────────────┤ │
    │  │ Survey     │  │ Bathymetry Panel     │ │
    │  │ Panel      │  │ (Results + 3D View)  │ │
    │  ├────────────┤  ├──────────────────────┤ │
    │  │ Telemetry  │  │ Three.js 3D          │ │
    │  │ Bar        │  │ Visualization        │ │
    │  └────────────┘  └──────────────────────┘ │
    └───────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
ROS2_Drone/
├── src/
│   ├── drone_control/                 # ROS 2 Python package
│   │   └── drone_control/
│   │       ├── bathymetric_survey_node.py   # Autonomous survey state machine
│   │       ├── surface_classifier_node.py   # HSV-based water/soil classification
│   │       ├── sonar_depth_node.py          # Sonar depth processing
│   │       ├── capture_map.py               # Overhead camera map capture
│   │       └── mavlink_node.py              # MAVLink communication helper
│   │
│   ├── drone_gcs/                     # React + Vite frontend
│   │   └── src/
│   │       ├── components/
│   │       │   ├── DroneMapCanvas.jsx       # 2D map with waypoint visualization
│   │       │   ├── ControlPanel.jsx         # Flight control & waypoint management
│   │       │   ├── SurveyPanel.jsx          # Survey mission configuration
│   │       │   ├── BathymetryPanel.jsx      # Survey results & metrics
│   │       │   ├── Bathymetry3DView.jsx     # Three.js 3D terrain visualization
│   │       │   └── TelemetryBar.jsx         # Live flight telemetry display
│   │       ├── hooks/
│   │       │   ├── useRos.js                # ROS WebSocket connection
│   │       │   ├── useDronePose.js          # Real-time drone position
│   │       │   ├── useDroneState.js         # Flight mode & armed state
│   │       │   └── useSurveyData.js         # Survey progress & results
│   │       └── config/
│   │           └── mapConfig.js             # Map dimensions & default params
│   │
│   ├── ardupilot_gazebo/              # Gazebo models, worlds & plugins
│   │   ├── models/                    # Iris drone, gimbal, terrain models
│   │   └── worlds/                    # SDF world files (terrain, lake, etc.)
│   │
│   └── ardupilot/                     # ArduPilot source (not tracked — see below)
│
├── gazebo_terrain/                    # Custom terrain meshes & textures
├── launch_ros.sh                      # One-command ROS 2 node launcher
├── terminal_commands.txt              # Quick-start command reference
└── .gitignore
```

---

## 🛠️ Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Ubuntu** | 24.04 LTS (Noble) | Host OS |
| **ROS 2** | Jazzy Jalisco | Middleware & communication |
| **Gazebo** | Harmonic | 3D physics simulation |
| **ArduPilot** | Latest `master` | Flight controller firmware (SITL) |
| **MAVROS** | Jazzy packages | MAVLink ↔ ROS 2 bridge |
| **Python** | 3.10+ | ROS 2 nodes |
| **Node.js** | 18+ / 20 LTS | React GCS frontend |
| **OpenCV** | 4.x | Surface classification |
| **Cyclone DDS** | — | RMW implementation |

### Additional ROS 2 Packages

```bash
sudo apt install \
  ros-jazzy-mavros \
  ros-jazzy-mavros-extras \
  ros-jazzy-ros-gz-bridge \
  ros-jazzy-rosbridge-server \
  ros-jazzy-tf2-web-republisher \
  ros-jazzy-cv-bridge
```

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/ROS2_Drone.git
cd ROS2_Drone
```

### 2. Set Up ArduPilot (SITL)

ArduPilot is **not tracked** in this repo due to its size (~3 GB). Clone it separately:

```bash
cd src
git clone --recurse-submodules https://github.com/ArduPilot/ardupilot.git
cd ardupilot
Tools/environment_install/install-prereqs-ubuntu.sh -y
. ~/.profile
cd ../..
```

### 3. Build the ROS 2 Workspace

```bash
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
source install/setup.bash
```

### 4. Install GCS Frontend Dependencies

```bash
cd src/drone_gcs
npm install
cd ../..
```

---

## ▶️ Running the System

The system requires **5 terminals**. Each step must be run in order:

### Terminal 1 — Gazebo Simulation

```bash
export GZ_SIM_RESOURCE_PATH=~/Desktop/ROS2_Drone/src/ardupilot_gazebo/models:~/Desktop/ROS2_Drone/src/ardupilot_gazebo/worlds:$GZ_SIM_RESOURCE_PATH
gz sim ~/Desktop/ROS2_Drone/src/ardupilot_gazebo/worlds/iris_terrain.sdf
```

### Terminal 2 — ArduPilot SITL

```bash
source ~/venv-ardupilot/bin/activate
cd ~/Desktop/ROS2_Drone/src/ardupilot
sim_vehicle.py -v ArduCopter -f gazebo-iris --model JSON --map --console
```

### Terminal 3 — ROS 2 Nodes (All-in-One)

```bash
cd ~/Desktop/ROS2_Drone
./launch_ros.sh
```

> This launches **MAVROS**, **rosbridge**, **GZ↔ROS2 bridges** (camera, sonar, gimbal, TF), the **surface classifier**, the **sonar depth node**, the **bathymetric survey node**, and the **map capture node**.

### Terminal 4 — React GCS

```bash
cd ~/Desktop/ROS2_Drone/src/drone_gcs
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 🎮 Usage

1. **Launch all terminals** as described above and wait for `All nodes launched!` in Terminal 3.
2. **Open the GCS** at `http://localhost:5173`. The connection indicator should show **CONNECTED**.
3. **Arm the drone** via the ArduPilot MAVProxy console or the GCS control panel.
4. **Plan waypoints** by clicking on the 2D map canvas.
5. **Configure a survey** using the Survey Panel — define the grid area and spacing.
6. **Start the survey** — the drone will autonomously:
   - Fly to each grid waypoint
   - Tilt gimbal downward and classify the surface
   - Descend sonar into detected water bodies
   - Measure water depth
   - Ascend and proceed to the next waypoint
   - Compute total water volume and return to launch
7. **View results** in the Bathymetry Panel and open the **3D Visualization** for an interactive terrain model.

---

## 🔌 ROS 2 Topics

### Published by `drone_control` Nodes

| Topic | Message Type | Description |
|---|---|---|
| `/survey/progress` | `String` (JSON) | Survey state, current waypoint, and completion % |
| `/survey/point_measured` | `String` (JSON) | Per-waypoint depth/elevation data |
| `/survey/results` | `String` (JSON) | Final survey results with volume calculations |
| `/sonar/range` | `Range` | Raw sonar distance reading |
| `/sonar/water_depth` | `Float64` | Computed water depth (-1 if above water) |
| `/sonar/status` | `String` | `ABOVE_WATER` or `SUBMERGED` |
| `/surface/classification` | `String` | `WATER` or `SOIL` |

### Subscribed Topics

| Topic | Message Type | Source |
|---|---|---|
| `/mavros/local_position/pose` | `PoseStamped` | MAVROS |
| `/gimbal_camera/image` | `Image` | Gazebo (via GZ bridge) |
| `/sonar/scan` | `LaserScan` | Gazebo (via GZ bridge) |
| `/overhead_camera/image` | `Image` | Gazebo (via GZ bridge) |
| `/bathymetric_survey/start` | `String` (JSON) | GCS (via rosbridge) |
| `/bathymetric_survey/abort` | `String` | GCS (via rosbridge) |

---

## 🧩 ROS 2 Nodes

| Node | File | Purpose |
|---|---|---|
| `bathymetric_survey_node` | `bathymetric_survey_node.py` | State-machine orchestrating the full survey mission |
| `surface_classifier_node` | `surface_classifier_node.py` | HSV-based camera classification (water vs soil) |
| `sonar_depth_node` | `sonar_depth_node.py` | Processes sonar readings to compute water depth |
| `capture_map` | `capture_map.py` | Captures overhead camera image as map background |
| `mavlink_node` | `mavlink_node.py` | MAVLink communication utilities |

---

## 🌍 Simulation Worlds

| World File | Description |
|---|---|
| `iris_terrain.sdf` | **Primary** — Terrain with water pit for bathymetric surveys |
| `iris_lake.sdf` | Lake environment for water detection testing |
| `iris_gcs.sdf` | Ground control station environment |
| `iris_runway.sdf` | Runway for takeoff/landing testing |
| `iris_warehouse.sdf` | Indoor warehouse environment |

---

## 🛡️ Tech Stack

| Layer | Technology |
|---|---|
| **Robotics Middleware** | ROS 2 Jazzy (Cyclone DDS) |
| **Flight Controller** | ArduPilot (SITL via MAVProxy) |
| **Simulation** | Gazebo Harmonic |
| **ROS ↔ MAVLink Bridge** | MAVROS |
| **ROS ↔ Browser Bridge** | rosbridge WebSocket |
| **Frontend Framework** | React 19 + Vite |
| **3D Visualization** | Three.js (via @react-three/fiber) |
| **Computer Vision** | OpenCV (HSV thresholding) |
| **Language (Nodes)** | Python 3.10+ |
| **Language (GCS)** | JavaScript (ES Modules) |

---

## 📄 License

This project is provided as-is for educational and research purposes. ArduPilot and Gazebo plugins (`ardupilot_gazebo`) retain their respective upstream licenses.

---

<p align="center">
  Built with ❤️ using ROS 2 • ArduPilot • Gazebo • React
</p>
