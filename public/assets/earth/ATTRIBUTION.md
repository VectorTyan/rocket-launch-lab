# NASA Blue Marble Earth texture

- Local file: `nasa-blue-marble-2002-2048.jpg`
- Dimensions: **2048 × 1024**, global longitude/latitude image, north at the top.
- File size: **266,599 bytes**.
- SHA-256: `d4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e`
- Retrieved: **2026-10-01**.
- Processing: none. The official JPEG is stored unchanged; no AI-generated imagery, resampling, cropping, or third-party texture source was used.

## Source and credit

[NASA Earth Observatory: The Blue Marble (2002), true-color global imagery](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) describes the composite and links its “Land Surface, Ocean Color, and Sea Ice” variant to legacy Visible Earth record **57730**.

The file was downloaded directly from [NASA's official image server](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg). The legacy Visible Earth page currently redirects to the Earth Observatory landing page; the official source article and image endpoint were checked separately.

Credit: **NASA Goddard Space Flight Center. Image by Reto Stöckli; enhancements by Robert Simmon.** The source article also credits MODIS science teams and the contributing data providers.

This is a historical global composite. NASA describes its land and coastal observations as collected during June–September 2001 and its publication as 2002. It is not a live Earth view, current weather map, modern land-use survey, or precise image registration of any launch pad. Rendering, approximate spherical placement, lighting, terrain, and flight animations are this game's own presentation, not NASA-validated results.

## Use conditions

Used as a source image under [NASA's Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), which generally permit educational/informational use of NASA imagery and computer graphical simulations, subject to the stated conditions and third-party exceptions. This project identifies NASA as the source of the unmodified image; it does not claim NASA endorsement, review, sponsorship, or ownership of the game's generated content. NASA insignia and logos are not included in this texture. No separate commercial entertainment licence or official product approval is claimed.

## Spherical orientation

`src/earth.js` maps the image using `u=(longitude+180)/360`, `v=(latitude+90)/180` with Three.js's default sphere UVs and image flip. `setSite()` rotates the selected site's outward normal to world `+Y`, its east tangent to `+X`, and north to `-Z`. This makes eastward teaching trajectories coherent on the globe; it is not a Google Maps alignment or a survey-grade Earth model.
