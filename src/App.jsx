import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './App.css'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (a, b, t) => a + (b - a) * t

function hashCell(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function createBuilding(cellX, cellZ, spacing) {
  const r = hashCell(cellX, cellZ)
  const r2 = hashCell(cellX + 19.4, cellZ - 7.2)
  const r3 = hashCell(cellX - 3.5, cellZ + 42.1)

  const isAvenue = cellX % 4 === 0 || cellZ % 5 === 0
  if (isAvenue || r < 0.18) return null

  const width = lerp(12, 25, r2)
  const depth = lerp(12, 25, r3)
  const height = lerp(18, 68, r)
  const x = cellX * spacing + lerp(-4, 4, r3)
  const z = cellZ * spacing + lerp(-4, 4, r2)

  const color = new THREE.Color().setHSL(0.66 + r * 0.1, 0.42, 0.13 + r2 * 0.05)
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.12,
  })

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, height / 2, z)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: r2 > 0.5 ? 0x16f7ff : 0xff2bd6, transparent: true, opacity: 0.34 }),
  )
  mesh.add(edges)

  if (r > 0.55) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.66, Math.max(1.4, height * 0.035), 0.22),
      new THREE.MeshBasicMaterial({ color: r2 > 0.5 ? 0x00f5ff : 0xff2bd6 }),
    )
    sign.position.set(0, height * 0.2, depth / 2 + 0.14)
    mesh.add(sign)
  }

  return {
    mesh,
    bounds: {
      x,
      z,
      halfX: width / 2,
      halfZ: depth / 2,
      height,
    },
  }
}

function createPlane() {
  const plane = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.9, 4.4),
    new THREE.MeshStandardMaterial({ color: 0xd7d7ff, roughness: 0.62, metalness: 0.18 }),
  )
  body.castShadow = true
  plane.add(body)

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.66, 1.1, 6),
    new THREE.MeshStandardMaterial({ color: 0xff5ac8, roughness: 0.45, metalness: 0.2 }),
  )
  nose.rotation.x = Math.PI / 2
  nose.position.z = -2.65
  plane.add(nose)

  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 0.16, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x19f5ff, roughness: 0.48, metalness: 0.18 }),
  )
  wing.position.z = -0.3
  wing.castShadow = true
  plane.add(wing)

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.12, 0.65),
    new THREE.MeshStandardMaterial({ color: 0xffb000, roughness: 0.55, metalness: 0.12 }),
  )
  tail.position.z = 2.0
  tail.position.y = 0.3
  plane.add(tail)

  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 1.2, 0.72),
    new THREE.MeshStandardMaterial({ color: 0xff2bd6, roughness: 0.5 }),
  )
  fin.position.z = 1.88
  fin.position.y = 0.78
  plane.add(fin)

  const prop = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 3.1, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xf8f8ff, transparent: true, opacity: 0.72 }),
  )
  prop.position.z = -3.28
  plane.add(prop)
  plane.userData.prop = prop

  return plane
}

function createTarget() {
  const group = new THREE.Group()
  const target = new THREE.Group()

  const rings = [
    { radius: 5.2, color: 0xfff7f7 },
    { radius: 4.0, color: 0xd7192f },
    { radius: 2.65, color: 0xfff7f7 },
    { radius: 1.35, color: 0xd7192f },
  ]

  rings.forEach((ring, index) => {
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(ring.radius, 28),
      new THREE.MeshBasicMaterial({ color: ring.color, side: THREE.DoubleSide }),
    )
    disk.position.z = index * 0.035
    target.add(disk)
  })

  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(5.28, 5.28, 0.34, 30)),
    new THREE.LineBasicMaterial({ color: 0x16f7ff, transparent: true, opacity: 0.72 }),
  )
  rim.rotation.x = Math.PI / 2
  target.add(rim)
  group.add(target)

  const balloonMaterial = new THREE.MeshStandardMaterial({ color: 0xff2bd6, emissive: 0x7b094f, roughness: 0.38 })
  const balloonOffsets = [-3.6, 0, 3.6]
  balloonOffsets.forEach((x, index) => {
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 10), balloonMaterial.clone())
    balloon.material.color.set(index === 1 ? 0x16f7ff : 0xff2bd6)
    balloon.material.emissive.set(index === 1 ? 0x064d55 : 0x7b094f)
    balloon.position.set(x, 8.6 + (index % 2) * 0.8, 0)
    group.add(balloon)

    const stringGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 7.45 + (index % 2) * 0.8, 0),
      new THREE.Vector3(x * 0.35, 5.4, 0),
    ])
    group.add(new THREE.Line(stringGeometry, new THREE.LineBasicMaterial({ color: 0xfff7ff, transparent: true, opacity: 0.58 })))
  })

  group.userData.targetDisk = target
  return group
}

function App() {
  const mountRef = useRef(null)
  const popupsRef = useRef(null)
  const restartRef = useRef(null)
  const [hud, setHud] = useState({ score: 0, speed: 0, altitude: 0, hits: 0, crashed: false, started: false })

  useEffect(() => {
    const mount = mountRef.current
    const popupLayer = popupsRef.current
    if (!mount) return undefined

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setClearColor(0x090512)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x130722, 0.011)

    const camera = new THREE.PerspectiveCamera(66, mount.clientWidth / mount.clientHeight, 0.1, 900)
    const hemi = new THREE.HemisphereLight(0x5bd7ff, 0x1b072d, 1.4)
    scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xff9a62, 2.5)
    sun.position.set(-40, 95, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    scene.add(sun)

    const city = new THREE.Group()
    scene.add(city)

    const targetGroup = new THREE.Group()
    scene.add(targetGroup)

    const effectGroup = new THREE.Group()
    scene.add(effectGroup)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0x07050d, roughness: 0.92, metalness: 0.05 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const grid = new THREE.GridHelper(2000, 80, 0xff2bd6, 0x2e144f)
    grid.material.transparent = true
    grid.material.opacity = 0.28
    scene.add(grid)

    const plane = createPlane()
    scene.add(plane)

    const state = {
      position: new THREE.Vector3(0, 28, 16),
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: 42,
      score: 0,
      hits: 0,
      started: false,
      crashed: false,
      lastTime: performance.now(),
      hudTime: 0,
      fireCooldown: 0,
      mouseX: 0,
      mouseY: 0,
    }

    const keys = new Set()
    const buildings = new Map()
    const bullets = []
    const targets = []
    const explosions = []
    const popups = []
    const spacing = 34
    const worldUp = new THREE.Vector3(0, 1, 0)
    const visualTarget = new THREE.Vector3()
    const tempVector = new THREE.Vector3()

    function clearGameplayObjects() {
      bullets.splice(0).forEach((bullet) => effectGroup.remove(bullet.mesh))
      targets.splice(0).forEach((target) => targetGroup.remove(target.mesh))
      explosions.splice(0).forEach((particle) => effectGroup.remove(particle.mesh))
      popups.splice(0).forEach((popup) => popup.element.remove())
    }

    function resetGame() {
      clearGameplayObjects()
      state.position.set(0, 28, 16)
      state.yaw = 0
      state.pitch = 0
      state.roll = 0
      state.speed = 42
      state.score = 0
      state.hits = 0
      state.fireCooldown = 0
      state.started = true
      state.crashed = false
      state.lastTime = performance.now()
      setHud({ score: 0, speed: state.speed, altitude: state.position.y, hits: 0, crashed: false, started: true })
    }

    restartRef.current = resetGame

    function maintainCity() {
      const currentCellZ = Math.floor(state.position.z / spacing)
      const minZ = currentCellZ - 74
      const maxZ = currentCellZ + 12
      const minX = Math.floor(state.position.x / spacing) - 14
      const maxX = Math.floor(state.position.x / spacing) + 14

      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = `${x}:${z}`
          if (buildings.has(key)) continue
          const building = createBuilding(x, z, spacing)
          buildings.set(key, building)
          if (building) city.add(building.mesh)
        }
      }

      for (const [key, building] of buildings) {
        const [x, z] = key.split(':').map(Number)
        if (z < minZ - 6 || z > maxZ + 6 || x < minX - 4 || x > maxX + 4) {
          if (building) city.remove(building.mesh)
          buildings.delete(key)
        }
      }
    }

    function getForwardVector(includePitch = true) {
      const climb = includePitch ? Math.sin(state.pitch) : 0
      const level = includePitch ? Math.cos(state.pitch) : 1
      return new THREE.Vector3(Math.sin(state.yaw) * level, climb, -Math.cos(state.yaw) * level).normalize()
    }

    function getRightVector() {
      const forward = getForwardVector(false)
      return new THREE.Vector3().crossVectors(forward, worldUp).normalize()
    }

    function updatePlaneVisual() {
      const forward = getForwardVector(true)
      // Three.js object lookAt points local +Z at the target. Our plane model's
      // nose/prop live on local -Z, so aim +Z backward to keep the nose aligned
      // with the actual flight vector.
      visualTarget.copy(state.position).addScaledVector(forward, -1)
      plane.position.copy(state.position)
      plane.up.copy(worldUp)
      plane.lookAt(visualTarget)
      plane.rotateZ(state.roll)
    }

    function updateCamera(dt) {
      const forward = getForwardVector(false)
      const targetPosition = state.position.clone().addScaledVector(forward, -24)
      targetPosition.y += 9.5
      camera.position.lerp(targetPosition, 1 - Math.pow(0.0003, dt))

      const lookAt = state.position.clone().addScaledVector(forward, 14)
      lookAt.y += 1.7 + state.pitch * 3
      camera.lookAt(lookAt)
    }

    function makeTracer(start, forward) {
      const end = start.clone().addScaledVector(forward, 5.2)
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
      const material = new THREE.LineBasicMaterial({ color: 0xfff15a, transparent: true, opacity: 0.96 })
      const mesh = new THREE.Line(geometry, material)
      effectGroup.add(mesh)
      bullets.push({ mesh, position: start.clone(), previous: start.clone(), velocity: forward.clone().multiplyScalar(185), ttl: 1.05, age: 0 })
    }

    function fireGuns() {
      const forward = getForwardVector(true)
      ;[-3.25, 3.25].forEach((x) => {
        const start = plane.localToWorld(new THREE.Vector3(x, -0.02, -0.92))
        makeTracer(start, forward)
      })
    }

    function createExplosion(position) {
      const colors = [0xfff15a, 0xff2bd6, 0x16f7ff, 0xffffff]
      for (let i = 0; i < 34; i += 1) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.55, 0.55),
          new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 1 }),
        )
        mesh.position.copy(position)
        effectGroup.add(mesh)

        const velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 42,
          (Math.random() - 0.25) * 36,
          (Math.random() - 0.5) * 42,
        )
        explosions.push({ mesh, velocity, ttl: 0.82, age: 0 })
      }
    }

    function addScorePopup(position, points) {
      if (!popupLayer) return
      const element = document.createElement('div')
      element.className = 'score-pop'
      element.textContent = `+${points}!`
      popupLayer.appendChild(element)
      popups.push({ element, position: position.clone(), age: 0, ttl: 1.15 })
    }

    function placeTarget(target, preferAhead = true) {
      const forward = getForwardVector(false)
      const right = getRightVector()
      const laneSlots = [0, -46, 46]
      const slot = target.mesh.userData.slot
      const inIntroLane = slot < laneSlots.length
      const distance = inIntroLane ? 145 + slot * 76 : preferAhead ? lerp(130, 460, Math.random()) : lerp(80, 360, Math.random())
      const lateral = inIntroLane ? laneSlots[slot] : lerp(-115, 115, Math.random())
      const vertical = inIntroLane ? clamp(state.position.y + 4 + slot * 2, 22, 54) : lerp(18, 58, Math.random())
      target.mesh.position.copy(state.position)
      target.mesh.position.addScaledVector(forward, distance)
      target.mesh.position.addScaledVector(right, lateral)
      target.mesh.position.y = vertical
      target.mesh.userData.wobble = Math.random() * Math.PI * 2
    }

    function spawnTarget(preferAhead = true) {
      const mesh = createTarget()
      mesh.userData.slot = targets.length
      const target = { mesh, radius: 6.2, active: true }
      placeTarget(target, preferAhead)
      targetGroup.add(mesh)
      targets.push(target)
    }

    function maintainTargets() {
      while (targets.length < 8) spawnTarget(true)

      const forward = getForwardVector(false)
      for (const target of targets) {
        const toTarget = tempVector.copy(target.mesh.position).sub(state.position)
        const behind = toTarget.dot(forward) < -90
        const tooFar = toTarget.lengthSq() > 600 * 600
        if (behind || tooFar || target.mesh.position.y < 6) placeTarget(target, true)
        target.mesh.userData.wobble += 0.022
        target.mesh.position.y += Math.sin(target.mesh.userData.wobble) * 0.018
        target.mesh.lookAt(camera.position)
      }
    }

    function updateBullets(dt) {
      for (let index = bullets.length - 1; index >= 0; index -= 1) {
        const bullet = bullets[index]
        bullet.age += dt
        bullet.ttl -= dt
        bullet.previous.copy(bullet.position)
        bullet.position.addScaledVector(bullet.velocity, dt)

        bullet.mesh.geometry.setFromPoints([bullet.previous, bullet.position])
        bullet.mesh.material.opacity = clamp(1 - bullet.age / 1.05, 0, 1)

        let hitTarget = null
        for (const target of targets) {
          if (bullet.position.distanceToSquared(target.mesh.position) < target.radius * target.radius) {
            hitTarget = target
            break
          }
        }

        if (hitTarget) {
          const points = 300
          state.score += points
          state.hits += 1
          createExplosion(hitTarget.mesh.position)
          addScorePopup(hitTarget.mesh.position, points)
          placeTarget(hitTarget, true)
          effectGroup.remove(bullet.mesh)
          bullets.splice(index, 1)
        } else if (bullet.ttl <= 0) {
          effectGroup.remove(bullet.mesh)
          bullets.splice(index, 1)
        }
      }
    }

    function updateExplosions(dt) {
      for (let index = explosions.length - 1; index >= 0; index -= 1) {
        const particle = explosions[index]
        particle.age += dt
        particle.ttl -= dt
        particle.velocity.y -= 22 * dt
        particle.mesh.position.addScaledVector(particle.velocity, dt)
        particle.mesh.rotation.x += dt * 9
        particle.mesh.rotation.y += dt * 11
        particle.mesh.material.opacity = clamp(particle.ttl / 0.82, 0, 1)
        particle.mesh.scale.setScalar(lerp(1.5, 0.2, particle.age / 0.82))
        if (particle.ttl <= 0) {
          effectGroup.remove(particle.mesh)
          explosions.splice(index, 1)
        }
      }
    }

    function updateScorePopups(dt) {
      const width = mount.clientWidth
      const height = mount.clientHeight
      for (let index = popups.length - 1; index >= 0; index -= 1) {
        const popup = popups[index]
        popup.age += dt
        popup.position.y += dt * 7
        const projected = popup.position.clone().project(camera)
        const visible = projected.z > -1 && projected.z < 1
        popup.element.style.opacity = visible ? String(clamp(1 - popup.age / popup.ttl, 0, 1)) : '0'
        popup.element.style.transform = `translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px)`
        if (popup.age >= popup.ttl) {
          popup.element.remove()
          popups.splice(index, 1)
        }
      }
    }

    function checkCrash() {
      const radius = 2.35
      if (state.position.y < 4) return true

      for (const building of buildings.values()) {
        if (!building) continue
        const b = building.bounds
        if (
          Math.abs(state.position.x - b.x) < b.halfX + radius &&
          Math.abs(state.position.z - b.z) < b.halfZ + radius &&
          state.position.y < b.height + radius
        ) {
          return true
        }
      }
      return false
    }

    let rafId = 0
    let isAlive = true

    function animate(now) {
      if (!isAlive) return
      const dt = Math.min((now - state.lastTime) / 1000, 0.04)
      state.lastTime = now

      maintainCity()
      maintainTargets()

      if (state.started && !state.crashed) {
        const left = keys.has('ArrowLeft') || keys.has('KeyA')
        const right = keys.has('ArrowRight') || keys.has('KeyD')
        const up = keys.has('ArrowUp') || keys.has('KeyW')
        const down = keys.has('ArrowDown') || keys.has('KeyS')
        const throttle = keys.has('ShiftLeft') || keys.has('ShiftRight')
        const firing = keys.has('Space')

        const rollInput = (left ? 1 : 0) + (right ? -1 : 0) - state.mouseX * 0.0015
        const pitchInput = (down ? 1 : 0) + (up ? -1 : 0) - state.mouseY * 0.0017

        state.roll += rollInput * dt * 1.65
        state.roll = Math.atan2(Math.sin(state.roll), Math.cos(state.roll))

        const bankAmount = Math.abs(Math.sin(state.roll))
        const uprightLift = Math.max(0, Math.cos(state.roll))
        const coordinatedTurn = -Math.sin(state.roll) * (0.72 + state.speed / 88)
        state.yaw += coordinatedTurn * dt

        const rollNoseDrop = (1 - uprightLift) * 0.5 + bankAmount * 0.16
        state.pitch = clamp(state.pitch + pitchInput * dt * 0.86 - rollNoseDrop * dt, -0.58, 0.5)
        state.speed = clamp(state.speed + (throttle ? 18 : 1.8 + rollNoseDrop * 8) * dt, 32, 76)

        const forward = getForwardVector(true)
        state.position.addScaledVector(forward, state.speed * dt)
        state.position.y -= ((1 - uprightLift) * 9 + bankAmount * 2.4) * dt
        state.position.y = Math.min(state.position.y, 74)
        if (state.position.y > 69) state.pitch -= dt * 0.32

        state.fireCooldown = Math.max(0, state.fireCooldown - dt)
        if (firing && state.fireCooldown <= 0) {
          fireGuns()
          state.fireCooldown = 0.085
        }

        state.score += dt * state.speed * 0.55
        state.mouseX *= 0.82
        state.mouseY *= 0.82

        if (checkCrash()) {
          state.crashed = true
          setHud({ score: Math.floor(state.score), speed: state.speed, altitude: state.position.y, hits: state.hits, crashed: true, started: true })
        }
      }

      updatePlaneVisual()
      updateBullets(dt)
      updateExplosions(dt)
      plane.userData.prop.rotation.z += dt * state.speed * 2.7
      ground.position.x = state.position.x
      ground.position.z = state.position.z
      grid.position.x = Math.round(state.position.x / spacing) * spacing
      grid.position.z = Math.round(state.position.z / spacing) * spacing

      updateCamera(dt)
      updateScorePopups(dt)
      renderer.render(scene, camera)

      state.hudTime += dt
      if (state.hudTime > 0.12 && !state.crashed) {
        state.hudTime = 0
        setHud({
          score: Math.floor(state.score),
          speed: Math.round(state.speed),
          altitude: Math.round(state.position.y),
          hits: state.hits,
          crashed: state.crashed,
          started: state.started,
        })
      }

      rafId = requestAnimationFrame(animate)
    }

    function onKeyDown(event) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
      if (event.code === 'Enter' || event.code === 'KeyR') resetGame()
      keys.add(event.code)
      if (!state.started && ['KeyW', 'ArrowUp', 'Space'].includes(event.code)) resetGame()
    }

    function onKeyUp(event) {
      keys.delete(event.code)
    }

    function onMouseMove(event) {
      if (document.pointerLockElement === renderer.domElement) {
        state.mouseX += event.movementX
        state.mouseY += event.movementY
      }
    }

    function onClick() {
      if (!state.started || state.crashed) resetGame()
      renderer.domElement.requestPointerLock?.()
    }

    function onResize() {
      const width = mount.clientWidth
      const height = mount.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMouseMove)
    renderer.domElement.addEventListener('click', onClick)

    resetGame()
    rafId = requestAnimationFrame(animate)

    return () => {
      isAlive = false
      cancelAnimationFrame(rafId)
      restartRef.current = null
      clearGameplayObjects()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('click', onClick)
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [])

  return (
    <main className="game-shell">
      <div className="skyline-bg" />
      <section className="hud hud-top">
        <div>
          <span className="label">STRATUS</span>
          <strong>{hud.score.toLocaleString()} pts</strong>
        </div>
        <div>
          <span className="label">HITS</span>
          <strong>{hud.hits}</strong>
        </div>
        <div>
          <span className="label">SPD</span>
          <strong>{hud.speed} kt</strong>
        </div>
        <div>
          <span className="label">ALT</span>
          <strong>{hud.altitude} m</strong>
        </div>
      </section>

      <div ref={mountRef} className="viewport" aria-label="Stratus playable 3D flight game" />
      <div ref={popupsRef} className="popup-layer" aria-hidden="true" />

      <section className="hud controls">
        <p><strong>Stick:</strong> W nose down / S nose up · <strong>Bank:</strong> A/D or arrows · <strong>Boost:</strong> Shift · <strong>Guns:</strong> Space · <strong>Mouse:</strong> click window · <strong>Restart:</strong> R/Enter</p>
      </section>

      {hud.crashed && (
        <div className="modal">
          <div className="modal-card">
            <span className="label">airframe status</span>
            <h1>Decorative crater achieved.</h1>
            <p>Final score: {hud.score.toLocaleString()} points · {hud.hits} targets popped</p>
            <button type="button" onClick={() => restartRef.current?.()}>Click, R, or Enter to fly again</button>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
