# Tiles Setup for Nuxt App

## Download Tiles

Download the `Tiles.zip` archive from this link:  
[Tiles.zip](https://drive.google.com/file/d/1sYm84ejMm5_8kaKK9cKE7g5--uCE26u_/view?usp=sharing)

---

## Installation Steps

1. **Unzip** `Tiles.zip`.
2. Verify that the extracted folder contains numbered subfolders (`0`, `1`, `2`, …) representing zoom levels.
3. **Move the folder** into your Nuxt project’s `public/` directory.
4. The final folder structure should look like this:
<pre>
euro-truck-nav/
    └── public/
        └── Tiles/
            ├── 0/
            ├── 1/
            ├── 2/
            └── ...
</pre>
5. Start your Nuxt app. Leaflet will load tiles from `/Tiles/{z}/{x}/{y}.png`.

---

## Notes
-   The `public/Tiles/` folder is **ignored in Git** to keep the repository size small.
-   Make sure not to commit the tiles folder. You can add the following to `.gitignore` if it isn’t already: `public/Tiles`
