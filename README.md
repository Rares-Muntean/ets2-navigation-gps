# Euro Truck Nav

**Euro Truck Nav** is an external GPS navigation system for Euro Truck Simulator 2 built using Typescript. It runs in the browser (perfect for a second monitor, tablet or phone) and provides real-time tracking and routing based on the in-game map.

<div align="center">
    <img src="https://github.com/user-attachments/assets/313c9f4c-ede2-44cf-bf9e-d3c9fcdcbc96" width="300" />
    <img width="300" alt="image" src="https://github.com/user-attachments/assets/51117ee8-cde4-44d3-86b3-16eb6843da11" />
</div>


> [!NOTE]
> **Map Support Status**
>
> Parsing and correcting map data is a manual process. Currently, the map support is as follows:
> *    **Supported:** Base Game and most older Map DLCs.
> *    **Not Supported (Yet):** West Balkans DLC.
> *    **Not Supported (Yet):** Greece DLC.
> *    **Not Supported (Yet):** Nordic Horizons (Norway expansion).

## Current Status: Work in Progress / Demo

Please consider this project a **Demo** or **Alpha**.

While the core navigation works, the project is far from perfect. Creating the routing graph required a massive amount of manual work in **QGIS**, fixing individual road segments, roundabouts, and intersections to ensure the GPS knows where it can and cannot go.

* **Bugs are expected:** I am human, and with a map this size, I'm 100% sure that missed connections or restricted turns.
* **Routing Quirks:** The `stepCost` (navigation weighting) is still being tweaked. You might notice the GPS taking slightly unusual routes or sometimes favoring a longer path. This can also happen because of missing connections, holes in the road network, or intersections that I missed.
* **Ongoing Fixes:** As I play the game and use the app, I log coordinates of broken road nodes and fix them in QGIS for future updates.
* **Known Quirks:** Inside company areas, it may help to move the truck slightly outside before clicking the map to route, as routing may fail otherwise.

> [!IMPORTANT]
> **Performance Warning**
>
> Please note that performance optimization is still a work in progress. Depending on your device (especially older tablets or phones), the map rendering might be slow or laggy. I am working on improving this!

## Prerequisites

Before installing, ensure you have the following software installed on your computer:

1.  **Node.js (LTS Version):** Required to run the application.
- Download the latest LTS version (Recommended): [https://nodejs.org/](https://nodejs.org/en/download)
2.  **Git:** Required to clone the telemetry repository automatically.
- Download Git: [https://git-scm.com/downloads](https://git-scm.com/downloads)
  
## Installation

### 1. Get the Code
You can either clone the repository using Git (recommended for easy updates) or download the ZIP file.

**Option A: Git Clone (Recommended)**
Open your terminal or command prompt and run:
```bash
git clone https://github.com/YOUR_USERNAME/euro-truck-nav.git
cd euro-truck-nav
```
**Option B: Download ZIP**
1. Click the Code button at the top of this page and select `Download ZIP`.
2. Extract the files to a folder on your computer.
3. Open that folder in your terminal or VS Code.

### 2. Prepare the Environment (Windows Users)
If you are on Windows, you may need to run the following commands to ensure the installation proceeds without problems.

**PowerShell Script Execution:**

If you encounter errors regarding disabled scripts in PowerShell, run one of the following commands as Administrator:
*Temporary Fix (Recommended):*
```Powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
*Permanent Fix:*
```Powershell
Set-ExecutionPolicy RemoteSigned
```

### 3. Install Dependencies
```bash
npm install
```

## Running the App
Start the development server with the following command and wait for the Ets2 Telemetry server to clone:
```Bash
npx nuxi dev --host 0.0.0.0
```
Follow the instructions from the opened .exe to install the telemetry plugin DLLs into your game directory.

> [!NOTE]
> **Troubleshooting:**
> If somehow the installation of the telemetry server fails, you can install it manually:
> 1. Download and the server from the [Funbits Telemetry Server Repo](https://github.com/Funbit/ets2-telemetry-server).
> 2. Extract the .zip into the root folder of this project.
> 3. Rename it: `ets2-telemetry-server'.

## How to Access
Once the server is running, you can access the dashboard from any device on your local network.
- On your PC (Same machine): http://localhost:3000
  
- On your Phone/Tablet (Second Monitor):
  
Find your PC's local IP address (e.g., 192.168.1.15) and visit: http://192.168.1.XX:3000

##  How it Works

1. **Telemetry:** The app uses a telemetry server to pull data (coordinates, speed, heading) directly from the running game.
2.  **Mapping:** The in-game coordinates are converted to a standard **WGS84** projection to allow them to work with web mapping libraries.
3.  **Routing:** A custom graph built from game files allows the app to calculate the shortest path to your destination.

<div align="center">
  <img width="895" height="649" alt="{C6CE05EA-1AD3-4C53-9815-E813C4B923D4}" src="https://github.com/user-attachments/assets/985894ff-89bf-4d10-a0f6-a2ef291fa90c" />
</div>

## How You Can Help Improve the Map

If you test the application and encounter broken intersections, missing road connections, roundabout issues, or strange routing behavior, you can help improve the navigation by reporting what you find.

### What to Report
- A brief description of the issue  
- The exact coordinates of the location  
- A screenshot from the app (optional but helpful)

### How to Collect Coordinates
1. Click or tap the spot on the map where the issue occurs  
2. Check the console — it prints the clicked coordinates  
3. Copy the coordinate pair and include it in your report

### Where to Send Reports
Send your findings to:

* byatisglaaki@gmail.com

Your reports help refine the routing graph and improve navigation accuracy.

**Note:**  
Reported issues will be addressed as time permits.

## Credits & Acknowledgements

This project stands on the shoulders of giants. A massive thank you to the following developers who made this possible:

### [@truckermudgeon](https://github.com/truckermudgeon)
Special thanks for the **['maps'](https://github.com/truckermudgeon/maps)** repository.
*   This provided the essential starting point for map parsing.
*   The logic for converting internal game coordinates to a usable format (WGS84) was invaluable for getting the map rendered correctly.

### [@Funbit](https://github.com/Funbit)
Thanks for the **['ets2-telemetry-server'](https://github.com/Funbit/ets2-telemetry-server)**.
*   This tool is the bridge that allows the browser to communicate with the game engine. Without this, we wouldn't have live truck data.

---

*Drive safe, and happy trucking!* 
