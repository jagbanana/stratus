# Stratus lighting plan

## Status and resume cue

Captured 2026-08-02 after a direct repository review. Pass 1 was implemented
and pushed as `574eb8c` (`Add cinematic lighting pass`). Justin then authorized
Pass 2; its local implementation is complete and awaits a separate publish
instruction. Gameplay behavior remains unchanged.

## Project constraints verified during review

- Stack: Vite, React, and Three.js `r185`; browser/WebGL static app deployed
  through Cloudflare.
- Main scene implementation: `src/App.jsx`, including the renderer, streamed
  procedural city, flight mechanics, collision, targets, and effects.
- Existing visual baseline: `WebGLRenderer` at device-pixel-ratio cap `1.5`,
  `PCFSoftShadowMap`, one shadow-casting directional light, hemisphere fill,
  exponential fog, dark `MeshStandardMaterial` building bodies, and emissive
  neon geometry.
- City streaming can retain roughly a thousand building cells around the
  aircraft, each with several meshes. Lighting must add atmosphere without
  multiplying draw calls or per-fragment light cost.
- `npm run lint` and `npm run build` passed at review time. The production
  JavaScript bundle is already about 761 kB before adding post-processing.

## Art direction

Create a perpetual neon blue-hour city: a low warm amber sun, a cold moon on
the opposing horizon, cyan/magenta/amber city luminance, and haze concentrated
near street level. The goal is a quiet, beautiful horizon that can interrupt a
flight with an entirely reasonable urge to stare at it.

Keep the existing low-poly / PS1-ish visual language. Contrast, color
composition, bloom, silhouettes, and atmospheric depth are more important than
physical-light count.

## Technology choices

| Technique | Decision | Implementation note |
| --- | --- | --- |
| Filmic tone mapping + bloom | Required | Use installed Three.js `EffectComposer`, `RenderPass`, `UnrealBloomPass`, FXAA, and `OutputPass`; configure ACES filmic tone mapping and exposure before tuning emitters. |
| Sun / moon | Required | The sun remains the one directional shadow source. The moon is a distant visual disc plus cool fill, not a second shadow system. |
| Low haze and clouds | Required | Use animated, depth-tested translucent cards/planes or instanced sprites. Keep density low above the flight path. |
| God rays | Required, faked first | Use sun/moon halo sprites and a few depth-tested translucent shaft cards whose strength depends on horizon angle. Do not begin with ray-marched volumetric fog. |
| GTAO | Pass 2, Cinematic tier only | Use installed `GTAOPass` at reduced resolution after measuring desktop/mobile cost. It grounds forms but is not the headline effect. |
| Street/building lights | Required, mostly emissive | Use emissive material, bloom, sprites, and instanced/shared geometry. Avoid a large array of actual lights. |
| Point/spot lights | Very limited | At most a small, nearby pool for aircraft/nav or a special hero effect; non-shadowed and distance-culled. |
| SSR / full volumetrics | Out of scope | Too costly and inconsistent for the browser/mobile target. |

## Pass 1 — cinematic lighting and atmosphere

1. Add the dependency-free composer pipeline using the installed Three.js
   addons. Render order: scene render, optional anti-aliasing, bloom, output.
   Ensure composer dimensions and pixel ratio update on resize.
2. Set renderer output/color handling, ACES filmic tone mapping, and exposure.
   Retune material emissive intensities so neon blooms without flattening the
   rest of the city.
3. Keep exactly one warm directional sun as the real shadow source. Make its
   target and shadow region follow the player enough to preserve useful local
   plane/building shadows; retain soft shadows.
4. Add a procedural sky gradient/dome plus low sun and moon discs. Add
   restrained halo sprites; they must read as distant atmospheric features,
   not HUD elements.
5. Add low-level haze/cloud layers that drift slowly and participate in the
   existing horizon composition. Use fog color/strength and cloud opacity to
   transition from warm near the sun to cool near the moon.
6. Add depth-tested faux shafts near a low sun/moon. Fade them by camera angle
   and distance/horizon position; buildings should occlude them naturally.
7. Verify no collision bounds, flight controls, spawning, scoring, or game UI
   are changed.

### Pass 1 acceptance checks

- Clear separation between warm horizon light, cool moon side, city silhouette,
  and emissive accents.
- Existing neon becomes luminous without washing out targets or HUD.
- Shadows remain useful around the aircraft while flying through streamed city
  space.
- Capture desktop (1440px) and mobile (390px) before/after screenshots;
  manually inspect sun-facing, moon-facing, and dense-city views.
- Run `npm run lint`, `npm run build`, and `git diff --check`.

## Pass 2 — living city and quality tiers

1. Add deterministic procedural emissive window/sign patterns to building
   facades, preferably shader/material based rather than hundreds of extra
   window meshes per building.
2. Add avenue street lamps using instanced or shared pole/head geometry,
   emissive materials, halo sprites, and bloom. They should look lit without
   requiring a point light per lamp.
3. Add selective rooftop aviation beacons, antenna lights, and glowing rooftop
   equipment. Keep colors/signatures deterministic by city cell.
4. Add subtle deterministic flicker/pulse variation. It should suggest a city
   with electrical habits, not an electrical emergency.
5. Add optional aircraft navigation lights and, only if profiling permits, a
   very small pooled local light/landing-light effect. It must be non-shadowed
   and culled outside its useful range.
6. Add quality tiers:
   - **Balanced (default):** tone mapping, bloom, atmosphere, emissive city,
     faux shafts; no GTAO.
   - **Cinematic:** adds reduced-resolution `GTAOPass` after profiling.
   - **Low/mobile fallback:** lower composer resolution/bloom cost and disable
     GTAO while retaining the core visual identity.
7. Measure frame time, renderer draw calls, and visual quality on desktop and
   mobile. Ensure cleanup disposes composer passes/render targets and avoids
   allocation churn as city cells stream in/out.

### Pass 2 acceptance checks

- Streets and rooftops create readable navigational depth at low altitude.
- Window/sign lights add life without materially increasing city mesh count or
  producing a large real-light shader loop.
- GTAO improves grounding in Cinematic mode but is safely absent in Balanced
  and low/mobile modes.
- Existing mechanics and collision bounds are unchanged.
- Repeat lint/build/diff checks and desktop/mobile visual regression captures.

## Non-negotiable performance guardrails

- Do not add a shadow-casting light per street, building, or window.
- Prefer shared materials, instancing, shader patterns, sprites, and bloom.
- Avoid full ray-marched volumetrics and screen-space reflections.
- Keep the renderer's device-pixel-ratio cap and make post-processing scale by
  tier/device capability.
- Profile before enabling GTAO by default.
