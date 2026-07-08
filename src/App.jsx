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

function App() {
  const mountRef = useRef(null)
  const restartRef = useRef(null)
  const [hud, setHud] = useState({ score: 0, speed: 0, altitude: 0, crashed: false, started: false })

  useEffect(() => {
    const mount = mountRef.current
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
      started: false,
      crashed: false,
      lastTime: performance.now(),
      hudTime: 0,
      mouseX: 0,
      mouseY: 0,
    }

    const keys = new Set()
    const buildings = new Map()
    const spacing = 34

    function resetGame() {
      state.position.set(0, 28, 16)
      state.yaw = 0
      state.pitch = 0
      state.roll = 0
      state.speed = 42
      state.score = 0
      state.started = true
      state.crashed = false
      state.lastTime = performance.now()
      setHud({ score: 0, speed: state.speed, altitude: state.position.y, crashed: false, started: true })
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

    function updateCamera(dt) {
      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw)).normalize()
      const behind = forward.clone().multiplyScalar(-22)
      const targetPosition = state.position.clone().add(behind)
      targetPosition.y += 8.5
      camera.position.lerp(targetPosition, 1 - Math.pow(0.001, dt))

      const lookAt = state.position.clone().add(forward.multiplyScalar(12))
      lookAt.y += 1.5 + state.pitch * 2
      camera.lookAt(lookAt)
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

      if (state.started && !state.crashed) {
        const left = keys.has('ArrowLeft') || keys.has('KeyA')
        const right = keys.has('ArrowRight') || keys.has('KeyD')
        const up = keys.has('ArrowUp') || keys.has('KeyW')
        const down = keys.has('ArrowDown') || keys.has('KeyS')
        const throttle = keys.has('ShiftLeft') || keys.has('ShiftRight')
        const brake = keys.has('Space')

        const rollInput = (left ? 1 : 0) + (right ? -1 : 0) - state.mouseX * 0.0015
        const pitchInput = (down ? 1 : 0) + (up ? -1 : 0) - state.mouseY * 0.0017

        state.roll += rollInput * dt * 1.65
        state.roll = Math.atan2(Math.sin(state.roll), Math.cos(state.roll))

        const bankAmount = Math.abs(Math.sin(state.roll))
        const uprightLift = Math.max(0, Math.cos(state.roll))
        const coordinatedTurn = -Math.sin(state.roll) * (0.42 + state.speed / 115)
        state.yaw += coordinatedTurn * dt

        const rollNoseDrop = (1 - uprightLift) * 0.5 + bankAmount * 0.16
        state.pitch = clamp(state.pitch + pitchInput * dt * 0.86 - rollNoseDrop * dt, -0.58, 0.5)
        state.speed = clamp(state.speed + (throttle ? 18 : brake ? -24 : 1.8 + rollNoseDrop * 8) * dt, 32, 76)

        const forward = new THREE.Vector3(Math.sin(state.yaw), state.pitch * 0.76, -Math.cos(state.yaw)).normalize()
        state.position.addScaledVector(forward, state.speed * dt)
        state.position.y -= ((1 - uprightLift) * 9 + bankAmount * 2.4) * dt
        state.position.y = Math.min(state.position.y, 74)
        if (state.position.y > 69) state.pitch -= dt * 0.32

        state.score += dt * state.speed * 0.55
        state.mouseX *= 0.82
        state.mouseY *= 0.82

        if (checkCrash()) {
          state.crashed = true
          setHud({ score: Math.floor(state.score), speed: state.speed, altitude: state.position.y, crashed: true, started: true })
        }
      }

      plane.position.copy(state.position)
      plane.rotation.set(state.pitch * 0.9, state.yaw, state.roll)
      plane.userData.prop.rotation.z += dt * state.speed * 2.7
      ground.position.x = state.position.x
      ground.position.z = state.position.z
      grid.position.x = Math.round(state.position.x / spacing) * spacing
      grid.position.z = Math.round(state.position.z / spacing) * spacing

      updateCamera(dt)
      renderer.render(scene, camera)

      state.hudTime += dt
      if (state.hudTime > 0.12 && !state.crashed) {
        state.hudTime = 0
        setHud({
          score: Math.floor(state.score),
          speed: Math.round(state.speed),
          altitude: Math.round(state.position.y),
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
          <span className="label">SPD</span>
          <strong>{hud.speed} kt</strong>
        </div>
        <div>
          <span className="label">ALT</span>
          <strong>{hud.altitude} m</strong>
        </div>
      </section>

      <div ref={mountRef} className="viewport" aria-label="Stratus playable 3D flight game" />

      <section className="hud controls">
        <p><strong>Stick:</strong> W nose down / S nose up · <strong>Bank:</strong> A/D or arrows · <strong>Boost:</strong> Shift · <strong>Brake:</strong> Space · <strong>Mouse:</strong> click window · <strong>Restart:</strong> R/Enter</p>
      </section>

      {hud.crashed && (
        <div className="modal">
          <div className="modal-card">
            <span className="label">airframe status</span>
            <h1>Decorative crater achieved.</h1>
            <p>Final score: {hud.score.toLocaleString()} points</p>
            <button type="button" onClick={() => restartRef.current?.()}>Click, R, or Enter to fly again</button>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
