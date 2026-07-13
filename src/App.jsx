import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './App.css'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (a, b, t) => a + (b - a) * t
const HIGH_SCORE_COOKIE = 'stratus_high_scores'
const MUSIC_PREF_KEY = 'stratus_music_enabled'

function readHighScores() {
  if (typeof document === 'undefined') return []
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${HIGH_SCORE_COOKIE}=`))
  if (!cookie) return []

  try {
    const parsed = JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('=')))
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => ({
        initials: String(entry.initials || 'AAA').replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'A'),
        score: Math.max(0, Math.floor(Number(entry.score) || 0)),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  } catch {
    return []
  }
}

function writeHighScores(scores) {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${HIGH_SCORE_COOKIE}=${encodeURIComponent(JSON.stringify(scores))}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function readMusicPreference() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(MUSIC_PREF_KEY) !== 'off'
}

function writeMusicPreference(enabled) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MUSIC_PREF_KEY, enabled ? 'on' : 'off')
}

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
  const musicControlsRef = useRef(null)
  const [hud, setHud] = useState({ score: 0, speed: 0, altitude: 0, hits: 0, crashed: false, started: false })
  const [highScores, setHighScores] = useState(() => readHighScores())
  const [initials, setInitials] = useState('ACE')
  const [scoreSubmitted, setScoreSubmitted] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(() => readMusicPreference())
  const musicEnabledRef = useRef(musicEnabled)

  const highScore = highScores[0]?.score || 0

  useEffect(() => {
    musicEnabledRef.current = musicEnabled
    writeMusicPreference(musicEnabled)
    if (musicEnabled) {
      musicControlsRef.current?.start()
    } else {
      musicControlsRef.current?.stop()
    }
  }, [musicEnabled])

  function submitHighScore(event) {
    event.preventDefault()
    const cleanInitials = initials.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'A')
    const nextScores = [...highScores, { initials: cleanInitials, score: hud.score }]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
    setInitials(cleanInitials)
    setHighScores(nextScores)
    writeHighScores(nextScores)
    setScoreSubmitted(true)
  }

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
      crashModalDelay: 0,
      mouseX: 0,
      mouseY: 0,
    }

    const keys = new Set()
    const buildings = new Map()
    const bullets = []
    const targets = []
    const explosions = []
    const crashPieces = []
    const popups = []
    const spacing = 34
    const worldUp = new THREE.Vector3(0, 1, 0)
    const visualTarget = new THREE.Vector3()
    const tempVector = new THREE.Vector3()
    const previousPlanePosition = new THREE.Vector3()
    const cameraViewProjection = new THREE.Matrix4()
    const cameraFrustum = new THREE.Frustum()
    const targetSphere = new THREE.Sphere()
    const audio = { context: null, master: null, music: null, musicLoop: null, musicPlaying: false, unlocked: false }

    function getAudioContext() {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      if (!audio.context) {
        audio.context = new AudioContext()
        audio.master = audio.context.createGain()
        audio.music = audio.context.createGain()
        audio.master.gain.value = 0.38
        audio.music.gain.value = musicEnabledRef.current ? 0.12 : 0.0001
        audio.music.connect(audio.master)
        audio.master.connect(audio.context.destination)
      }
      if (audio.context.state === 'suspended') audio.context.resume()
      audio.unlocked = true
      if (musicEnabledRef.current) startMusic()
      return audio.context
    }

    function playTone({ frequency = 440, endFrequency = frequency, type = 'square', gain = 0.2, duration = 0.12, delay = 0, pan = 0 }) {
      const context = getAudioContext()
      if (!context || !audio.master) return
      const start = context.currentTime + delay
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      const stereo = context.createStereoPanner?.()

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration)
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      oscillator.connect(envelope)
      if (stereo) {
        stereo.pan.value = pan
        envelope.connect(stereo)
        stereo.connect(audio.master)
      } else {
        envelope.connect(audio.master)
      }
      oscillator.start(start)
      oscillator.stop(start + duration + 0.03)
    }

    function playNoise({ gain = 0.25, duration = 0.2, delay = 0, lowpass = 1800, pan = 0 }) {
      const context = getAudioContext()
      if (!context || !audio.master) return
      const start = context.currentTime + delay
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i += 1) {
        const fade = 1 - i / data.length
        data[i] = (Math.random() * 2 - 1) * fade
      }

      const source = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const envelope = context.createGain()
      const stereo = context.createStereoPanner?.()
      source.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(lowpass, start)
      filter.frequency.exponentialRampToValueAtTime(80, start + duration)
      envelope.gain.setValueAtTime(gain, start)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      source.connect(filter)
      filter.connect(envelope)
      if (stereo) {
        stereo.pan.value = pan
        envelope.connect(stereo)
        stereo.connect(audio.master)
      } else {
        envelope.connect(audio.master)
      }
      source.start(start)
      source.stop(start + duration + 0.02)
    }

    function playShootSound() {
      playNoise({ gain: 0.09, duration: 0.055, lowpass: 4200, pan: -0.24 })
      playNoise({ gain: 0.09, duration: 0.055, delay: 0.012, lowpass: 4200, pan: 0.24 })
      playTone({ frequency: 155, endFrequency: 78, type: 'sawtooth', gain: 0.08, duration: 0.07 })
    }

    function playTargetHitSound() {
      playTone({ frequency: 880, endFrequency: 1320, type: 'triangle', gain: 0.18, duration: 0.08 })
      playTone({ frequency: 1320, endFrequency: 1760, type: 'triangle', gain: 0.14, duration: 0.12, delay: 0.045 })
      playNoise({ gain: 0.12, duration: 0.12, lowpass: 5200 })
    }

    function playCrashSound() {
      playNoise({ gain: 0.5, duration: 0.85, lowpass: 2400 })
      playNoise({ gain: 0.28, duration: 0.38, delay: 0.08, lowpass: 5600 })
      playTone({ frequency: 95, endFrequency: 34, type: 'sawtooth', gain: 0.32, duration: 0.78 })
      playTone({ frequency: 55, endFrequency: 28, type: 'square', gain: 0.22, duration: 0.9, delay: 0.05 })
    }

    function playMusicTone({ frequency, start, duration = 0.12, gain = 0.08, type = 'square', pan = 0 }) {
      if (!audio.context || !audio.music || !musicEnabledRef.current) return
      const oscillator = audio.context.createOscillator()
      const envelope = audio.context.createGain()
      const stereo = audio.context.createStereoPanner?.()

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, start)
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      oscillator.connect(envelope)
      if (stereo) {
        stereo.pan.value = pan
        envelope.connect(stereo)
        stereo.connect(audio.music)
      } else {
        envelope.connect(audio.music)
      }
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    }

    function scheduleMusicLoop() {
      if (!audio.context || !audio.music || !audio.musicPlaying || !musicEnabledRef.current) return

      const beat = 0.18
      const start = audio.context.currentTime + 0.04
      const melody = [659, 784, 880, 784, 659, 523, 587, 659, 988, 880, 784, 659, 587, 659, 784, 988]
      const bass = [165, 165, 196, 196, 220, 220, 196, 196, 147, 147, 165, 165, 196, 196, 247, 247]

      melody.forEach((frequency, index) => {
        const when = start + index * beat
        playMusicTone({ frequency, start: when, duration: beat * 0.72, gain: index % 4 === 0 ? 0.075 : 0.055, type: 'square', pan: index % 2 ? 0.18 : -0.18 })
        playMusicTone({ frequency: bass[index], start: when, duration: beat * 0.55, gain: 0.05, type: 'triangle', pan: -0.08 })
        if (index % 4 === 2) playMusicTone({ frequency: frequency * 1.5, start: when + beat * 0.46, duration: beat * 0.34, gain: 0.025, type: 'square', pan: 0.26 })
      })

      audio.musicLoop = window.setTimeout(scheduleMusicLoop, beat * melody.length * 1000)
    }

    function startMusic() {
      if (!audio.context || !audio.music || audio.musicPlaying || !musicEnabledRef.current) return
      audio.musicPlaying = true
      audio.music.gain.cancelScheduledValues(audio.context.currentTime)
      audio.music.gain.setTargetAtTime(0.12, audio.context.currentTime, 0.08)
      scheduleMusicLoop()
    }

    function stopMusic() {
      if (audio.musicLoop) window.clearTimeout(audio.musicLoop)
      audio.musicLoop = null
      audio.musicPlaying = false
      if (audio.context && audio.music) {
        audio.music.gain.cancelScheduledValues(audio.context.currentTime)
        audio.music.gain.setTargetAtTime(0.0001, audio.context.currentTime, 0.04)
      }
    }

    musicControlsRef.current = {
      start: () => {
        getAudioContext()
        startMusic()
      },
      stop: stopMusic,
    }

    function clearGameplayObjects() {
      bullets.splice(0).forEach((bullet) => effectGroup.remove(bullet.mesh))
      targets.splice(0).forEach((target) => targetGroup.remove(target.mesh))
      explosions.splice(0).forEach((particle) => effectGroup.remove(particle.mesh))
      crashPieces.splice(0).forEach((piece) => effectGroup.remove(piece.mesh))
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
      state.crashModalDelay = 0
      state.started = true
      state.crashed = false
      state.lastTime = performance.now()
      plane.visible = true
      setScoreSubmitted(false)
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
      camera.updateMatrixWorld()
      cameraViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      cameraFrustum.setFromProjectionMatrix(cameraViewProjection)
    }

    function isTargetVisibleToPlayer(target) {
      targetSphere.center.copy(target.mesh.position)
      targetSphere.radius = target.radius
      return cameraFrustum.intersectsSphere(targetSphere)
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
      playShootSound()
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

    function addCrashPiece(geometry, material, localPosition, localRotation, localScale, velocity, spin, ttl = 3.8) {
      const pieceMaterial = material.clone()
      pieceMaterial.transparent = true
      const mesh = new THREE.Mesh(geometry, pieceMaterial)
      mesh.position.copy(plane.localToWorld(localPosition.clone()))
      mesh.quaternion.copy(plane.quaternion)
      mesh.rotation.x += localRotation.x
      mesh.rotation.y += localRotation.y
      mesh.rotation.z += localRotation.z
      mesh.scale.copy(localScale)
      effectGroup.add(mesh)
      crashPieces.push({ mesh, velocity, spin, ttl, age: 0 })
    }

    function createCrashEffect() {
      const impact = state.position.clone()
      const forward = getForwardVector(true)
      const right = getRightVector()
      const up = worldUp.clone()
      const base = forward.clone().multiplyScalar(24)

      plane.visible = false
      playCrashSound()
      createExplosion(impact)
      for (let i = 0; i < 62; i += 1) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.42, 0.42),
          new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xfff15a : i % 3 === 1 ? 0xff2bd6 : 0x16f7ff, transparent: true, opacity: 1 }),
        )
        mesh.position.copy(impact)
        effectGroup.add(mesh)
        const velocity = base.clone()
          .addScaledVector(right, (Math.random() - 0.5) * 70)
          .addScaledVector(up, Math.random() * 58)
          .add(new THREE.Vector3((Math.random() - 0.5) * 18, 0, (Math.random() - 0.5) * 18))
        explosions.push({ mesh, velocity, ttl: 1.35, age: 0 })
      }

      const metal = new THREE.MeshStandardMaterial({ color: 0xd7d7ff, roughness: 0.72, metalness: 0.25 })
      const cyan = new THREE.MeshStandardMaterial({ color: 0x19f5ff, emissive: 0x063a44, roughness: 0.52, metalness: 0.18 })
      const magenta = new THREE.MeshStandardMaterial({ color: 0xff5ac8, emissive: 0x4d092f, roughness: 0.5, metalness: 0.18 })
      const amber = new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0x4b2a00, roughness: 0.58, metalness: 0.12 })
      const white = new THREE.MeshBasicMaterial({ color: 0xf8f8ff, transparent: true, opacity: 0.82 })
      const scatter = [
        [new THREE.BoxGeometry(1.0, 0.75, 2.1), metal, new THREE.Vector3(0, 0, -0.9), new THREE.Euler(0.3, 0.1, 0.4), new THREE.Vector3(1, 1, 1), 0.2, 0.5, 42],
        [new THREE.BoxGeometry(0.9, 0.68, 1.8), metal, new THREE.Vector3(0, 0, 1.0), new THREE.Euler(-0.25, 0.2, -0.2), new THREE.Vector3(1, 1, 1), -0.15, 0.45, 36],
        [new THREE.BoxGeometry(3.2, 0.14, 0.95), cyan, new THREE.Vector3(-1.8, 0, -0.3), new THREE.Euler(0.1, 0.15, -0.2), new THREE.Vector3(1, 1, 1), -1.1, 0.2, 54],
        [new THREE.BoxGeometry(3.2, 0.14, 0.95), cyan, new THREE.Vector3(1.8, 0, -0.3), new THREE.Euler(-0.1, -0.15, 0.2), new THREE.Vector3(1, 1, 1), 1.1, 0.2, 54],
        [new THREE.ConeGeometry(0.66, 1.1, 6), magenta, new THREE.Vector3(0, 0, -2.65), new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Vector3(1, 1, 1), 0, 1.0, 48],
        [new THREE.BoxGeometry(2.8, 0.12, 0.65), amber, new THREE.Vector3(0, 0.3, 2.0), new THREE.Euler(0.2, 0.1, 0.1), new THREE.Vector3(1, 1, 1), 0, -0.8, 40],
        [new THREE.BoxGeometry(0.18, 1.2, 0.72), magenta, new THREE.Vector3(0, 0.78, 1.88), new THREE.Euler(0.3, -0.25, 0.2), new THREE.Vector3(1, 1, 1), 0.3, 0.9, 45],
        [new THREE.BoxGeometry(0.14, 3.1, 0.12), white, new THREE.Vector3(0, 0, -3.28), new THREE.Euler(0, 0, 0), new THREE.Vector3(1, 1, 1), 0, 1.35, 64],
      ]

      scatter.forEach(([geometry, material, localPosition, localRotation, localScale, side, lift, speed]) => {
        const velocity = base.clone()
          .addScaledVector(right, side * speed + (Math.random() - 0.5) * 18)
          .addScaledVector(up, lift * speed + Math.random() * 16)
        const spin = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12)
        addCrashPiece(geometry, material, localPosition, localRotation, localScale, velocity, spin)
      })
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

    function awardTarget(target, points) {
      state.score += points
      state.hits += 1
      playTargetHitSound()
      createExplosion(target.mesh.position)
      addScorePopup(target.mesh.position, points)
      placeTarget(target, true)
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
          if (!isTargetVisibleToPlayer(target)) continue
          if (bullet.position.distanceToSquared(target.mesh.position) < target.radius * target.radius) {
            hitTarget = target
            break
          }
        }

        if (hitTarget) {
          awardTarget(hitTarget, 300)
          effectGroup.remove(bullet.mesh)
          bullets.splice(index, 1)
        } else if (bullet.ttl <= 0) {
          effectGroup.remove(bullet.mesh)
          bullets.splice(index, 1)
        }
      }
    }

    function checkTargetFlyThrough() {
      const planeRadius = 2.35
      for (const target of targets) {
        const combinedRadius = target.radius + planeRadius
        const path = tempVector.copy(state.position).sub(previousPlanePosition)
        const pathLengthSq = path.lengthSq()
        let closestDistanceSq
        if (pathLengthSq > 0.0001) {
          const t = clamp(target.mesh.position.clone().sub(previousPlanePosition).dot(path) / pathLengthSq, 0, 1)
          closestDistanceSq = previousPlanePosition.clone().addScaledVector(path, t).distanceToSquared(target.mesh.position)
        } else {
          closestDistanceSq = state.position.distanceToSquared(target.mesh.position)
        }
        if (closestDistanceSq < combinedRadius * combinedRadius) {
          awardTarget(target, 500)
          return
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

    function updateCrashPieces(dt) {
      for (let index = crashPieces.length - 1; index >= 0; index -= 1) {
        const piece = crashPieces[index]
        piece.age += dt
        piece.ttl -= dt
        piece.velocity.y -= 24 * dt
        piece.mesh.position.addScaledVector(piece.velocity, dt)
        piece.mesh.rotation.x += piece.spin.x * dt
        piece.mesh.rotation.y += piece.spin.y * dt
        piece.mesh.rotation.z += piece.spin.z * dt
        if (piece.mesh.position.y < 1.5) {
          piece.mesh.position.y = 1.5
          piece.velocity.y *= -0.22
          piece.velocity.x *= 0.72
          piece.velocity.z *= 0.72
        }
        if (piece.mesh.material.opacity !== undefined) {
          piece.mesh.material.opacity = clamp(piece.ttl / 1.2, 0, 1)
        }
        if (piece.ttl <= 0) {
          effectGroup.remove(piece.mesh)
          crashPieces.splice(index, 1)
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

        previousPlanePosition.copy(state.position)
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

        checkTargetFlyThrough()

        state.score += dt * state.speed * 0.55
        state.mouseX *= 0.82
        state.mouseY *= 0.82

        if (checkCrash()) {
          updatePlaneVisual()
          state.crashed = true
          state.crashModalDelay = 1.25
          createCrashEffect()
          setHud({ score: Math.floor(state.score), speed: Math.round(state.speed), altitude: Math.round(state.position.y), hits: state.hits, crashed: false, started: true })
        }
      }

      if (!state.crashed) updatePlaneVisual()
      updateCamera(dt)
      updateBullets(dt)
      updateExplosions(dt)
      updateCrashPieces(dt)
      if (plane.visible) plane.userData.prop.rotation.z += dt * state.speed * 2.7
      if (state.crashed && state.crashModalDelay > 0) {
        state.crashModalDelay -= dt
        if (state.crashModalDelay <= 0) {
          setHud({ score: Math.floor(state.score), speed: Math.round(state.speed), altitude: Math.round(state.position.y), hits: state.hits, crashed: true, started: true })
        }
      }
      ground.position.x = state.position.x
      ground.position.z = state.position.z
      grid.position.x = Math.round(state.position.x / spacing) * spacing
      grid.position.z = Math.round(state.position.z / spacing) * spacing

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
      const isTextEntry = event.target instanceof HTMLInputElement
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) && !isTextEntry) event.preventDefault()
      getAudioContext()
      if (!isTextEntry && (event.code === 'Enter' || event.code === 'KeyR')) resetGame()
      if (!isTextEntry) keys.add(event.code)
      if (!isTextEntry && !state.started && ['KeyW', 'ArrowUp', 'Space'].includes(event.code)) resetGame()
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
      getAudioContext()
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
      musicControlsRef.current = null
      stopMusic()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('click', onClick)
      if (audio.context) audio.context.close()
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
          <span className="label">HIGH</span>
          <strong>{Math.max(highScore, hud.score).toLocaleString()}</strong>
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

      <button
        type="button"
        className={`music-toggle ${musicEnabled ? 'is-on' : 'is-off'}`}
        onClick={() => {
          const nextMusicEnabled = !musicEnabled
          musicEnabledRef.current = nextMusicEnabled
          setMusicEnabled(nextMusicEnabled)
          if (nextMusicEnabled) musicControlsRef.current?.start()
          else musicControlsRef.current?.stop()
        }}
        aria-pressed={musicEnabled}
        aria-label={musicEnabled ? 'Turn music off' : 'Turn music on'}
      >
        {musicEnabled ? '♫ Music on' : 'Music off'}
      </button>

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

            {!scoreSubmitted ? (
              <form className="initials-form" onSubmit={submitHighScore}>
                <label htmlFor="initials">Enter initials</label>
                <div className="initials-row">
                  <input
                    id="initials"
                    value={initials}
                    maxLength={3}
                    autoFocus
                    onChange={(event) => setInitials(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
                    aria-label="Three initials for high score"
                  />
                  <button type="submit">Save score</button>
                </div>
              </form>
            ) : (
              <p className="score-saved">Score saved. Immortality achieved, subject to cookie retention.</p>
            )}

            <div className="leaderboard" aria-label="Top 10 high scores">
              <span className="label">top pilots</span>
              <ol>
                {highScores.length > 0 ? highScores.map((entry, index) => (
                  <li key={`${entry.initials}-${entry.score}-${index}`}>
                    <span>{entry.initials}</span>
                    <strong>{entry.score.toLocaleString()}</strong>
                  </li>
                )) : (
                  <li className="empty-score"><span>---</span><strong>no scores yet</strong></li>
                )}
              </ol>
            </div>

            <button type="button" onClick={() => restartRef.current?.()}>Click, R, or Enter to fly again</button>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
