import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './App.css'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (a, b, t) => a + (b - a) * t
const HIGH_SCORE_COOKIE = 'stratus_high_scores'
const MUSIC_PREF_KEY = 'stratus_music_enabled'
const MUSIC_TRACK_URL = '/audio/this-place-is-so-lonely.mp3'
const MAX_AMMO = 300
const AMMO_DRAIN_PER_SECOND = 100
// The launch lane is normally an avenue. Reserve this cell for the opening
// obstacle: an unboosted, level flight reaches its near face about five
// seconds after the countdown's "GO!" cue.
const INTRO_OBSTACLE_CELL = { x: 0, z: -13 }
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 6)
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 5)
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX)

const BUILDING_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: 0x101426, roughness: 0.76, metalness: 0.2 }),
  new THREE.MeshStandardMaterial({ color: 0x171128, roughness: 0.8, metalness: 0.16 }),
  new THREE.MeshStandardMaterial({ color: 0x102126, roughness: 0.72, metalness: 0.24 }),
  new THREE.MeshStandardMaterial({ color: 0x24202d, roughness: 0.84, metalness: 0.12 }),
]

const NEON_MATERIALS = [0x16f7ff, 0xff2bd6, 0xffb000, 0x7dff72].map((color) => (
  new THREE.MeshBasicMaterial({ color, toneMapped: false })
))

const EDGE_MATERIALS = [0x16f7ff, 0xff2bd6, 0xffb000, 0x7dff72].map((color) => (
  new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3, toneMapped: false })
))

function detectTouchLikely() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches
  const compactScreen = Math.min(window.innerWidth, window.innerHeight) <= 820
  return Boolean(coarsePointer || navigator.maxTouchPoints > 0 || compactScreen)
}

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

function addBuildingBox(group, material, width, height, depth, y, x = 0, z = 0) {
  const mesh = new THREE.Mesh(UNIT_BOX, material)
  mesh.position.set(x, y, z)
  mesh.scale.set(width, height, depth)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function addBuildingEdges(group, material, width, height, depth, y, x = 0, z = 0) {
  const edges = new THREE.LineSegments(UNIT_EDGES, material)
  edges.position.set(x, y, z)
  edges.scale.set(width, height, depth)
  group.add(edges)
}

function createBuilding(cellX, cellZ, spacing) {
  const r = hashCell(cellX, cellZ)
  const r2 = hashCell(cellX + 19.4, cellZ - 7.2)
  const r3 = hashCell(cellX - 3.5, cellZ + 42.1)
  const r4 = hashCell(cellX + 61.7, cellZ + 13.8)
  const r5 = hashCell(cellX - 28.6, cellZ - 51.3)

  const isIntroObstacle = cellX === INTRO_OBSTACLE_CELL.x && cellZ === INTRO_OBSTACLE_CELL.z
  const isAvenue = cellX % 4 === 0 || cellZ % 5 === 0
  if (!isIntroObstacle && (isAvenue || r < 0.18)) return null

  const width = lerp(12, 25, r2)
  const depth = lerp(12, 25, r3)
  const height = lerp(18, 68, r)
  const x = cellX * spacing + lerp(-4, 4, r3)
  const z = cellZ * spacing + lerp(-4, 4, r2)

  const mesh = new THREE.Group()
  mesh.position.set(x, 0, z)

  const bodyMaterial = BUILDING_MATERIALS[Math.floor(r3 * BUILDING_MATERIALS.length)]
  const neonIndex = Math.floor(r5 * NEON_MATERIALS.length)
  const neonMaterial = NEON_MATERIALS[neonIndex]
  const edgeMaterial = EDGE_MATERIALS[neonIndex]
  const style = Math.floor(r4 * 5)

  if (style === 0) {
    addBuildingBox(mesh, bodyMaterial, width, height, depth, height / 2)
    const crownHeight = Math.min(7, height * 0.13)
    addBuildingBox(mesh, neonMaterial, width * 0.7, crownHeight, depth * 0.7, height - crownHeight / 2)
    addBuildingEdges(mesh, edgeMaterial, width, height, depth, height / 2)
  } else if (style === 1) {
    const lowerHeight = height * 0.36
    const middleHeight = height * 0.38
    const upperHeight = height - lowerHeight - middleHeight
    addBuildingBox(mesh, bodyMaterial, width, lowerHeight, depth, lowerHeight / 2)
    addBuildingBox(mesh, bodyMaterial, width * 0.78, middleHeight, depth * 0.78, lowerHeight + middleHeight / 2)
    addBuildingBox(mesh, bodyMaterial, width * 0.54, upperHeight, depth * 0.54, lowerHeight + middleHeight + upperHeight / 2)
    addBuildingEdges(mesh, edgeMaterial, width * 0.54, upperHeight, depth * 0.54, height - upperHeight / 2)
  } else if (style === 2) {
    const podiumHeight = height * 0.2
    const towerHeight = height - podiumHeight
    addBuildingBox(mesh, bodyMaterial, width, podiumHeight, depth, podiumHeight / 2)
    addBuildingBox(mesh, bodyMaterial, width * 0.36, towerHeight, depth * 0.72, podiumHeight + towerHeight / 2, -width * 0.27)
    addBuildingBox(mesh, bodyMaterial, width * 0.36, towerHeight * 0.82, depth * 0.72, podiumHeight + towerHeight * 0.41, width * 0.27)
    addBuildingBox(mesh, neonMaterial, width * 0.27, 1.1, depth * 0.76, height * 0.62, 0)
  } else if (style === 3) {
    const podiumHeight = height * 0.22
    const shaftHeight = height * 0.58
    const crownHeight = height - podiumHeight - shaftHeight
    const offsetX = (r2 - 0.5) * width * 0.2
    const offsetZ = (r3 - 0.5) * depth * 0.2
    addBuildingBox(mesh, bodyMaterial, width, podiumHeight, depth, podiumHeight / 2)
    addBuildingBox(mesh, bodyMaterial, width * 0.72, shaftHeight, depth * 0.72, podiumHeight + shaftHeight / 2, offsetX, offsetZ)
    addBuildingBox(mesh, bodyMaterial, width * 0.48, crownHeight, depth * 0.48, height - crownHeight / 2, -offsetX, -offsetZ)
    addBuildingEdges(mesh, edgeMaterial, width * 0.72, shaftHeight, depth * 0.72, podiumHeight + shaftHeight / 2, offsetX, offsetZ)
  } else {
    const blockHeight = height * 0.78
    const utilityHeight = height * 0.13
    const spireHeight = height - blockHeight - utilityHeight
    addBuildingBox(mesh, bodyMaterial, width, blockHeight, depth, blockHeight / 2)
    addBuildingBox(mesh, bodyMaterial, width * 0.48, utilityHeight, depth * 0.48, blockHeight + utilityHeight / 2)
    const spire = new THREE.Mesh(UNIT_CONE, neonMaterial)
    spire.position.y = height - spireHeight / 2
    spire.scale.set(Math.max(0.8, width * 0.08), spireHeight, Math.max(0.8, depth * 0.08))
    mesh.add(spire)
    addBuildingEdges(mesh, edgeMaterial, width, blockHeight, depth, blockHeight / 2)
  }

  const bandCount = 1 + Math.floor(r2 * 3)
  for (let index = 0; index < bandCount; index += 1) {
    const bandY = height * (0.28 + index * 0.19 + r5 * 0.04)
    if (bandY > height - 2) break
    addBuildingBox(mesh, neonMaterial, width + 0.18, 0.34, depth + 0.18, bandY)
  }

  if (r3 > 0.42 && style !== 2) {
    const finHeight = height * lerp(0.24, 0.5, r4)
    const finY = height * 0.18 + finHeight / 2
    const finWidth = Math.max(0.28, width * 0.018)
    addBuildingBox(mesh, neonMaterial, finWidth, finHeight, 0.28, finY, -width * 0.35, depth / 2 + 0.15)
    addBuildingBox(mesh, neonMaterial, finWidth, finHeight * 0.72, 0.28, finY * 0.9, width * 0.35, depth / 2 + 0.15)
  }

  if (r > 0.72 && style !== 4) {
    const antennaHeight = Math.min(6, height * 0.12)
    const antenna = new THREE.Mesh(UNIT_CYLINDER, neonMaterial)
    antenna.position.y = height + antennaHeight / 2
    antenna.scale.set(0.3, antennaHeight, 0.3)
    mesh.add(antenna)
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

function createAmmoCrate() {
  const group = new THREE.Group()
  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x263c24, emissive: 0x0c2e16, roughness: 0.42, metalness: 0.28 })
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0x7dff72, toneMapped: false })
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.86, toneMapped: false })

  const crate = new THREE.Mesh(new THREE.BoxGeometry(7.2, 4.8, 4.8), crateMaterial)
  crate.castShadow = true
  crate.receiveShadow = true
  group.add(crate)

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(7.2, 4.8, 4.8)), edgeMaterial)
  group.add(edges)

  ;[-2.15, 0, 2.15].forEach((x) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 5.02, 4.98), stripeMaterial)
    stripe.position.x = x
    group.add(stripe)
  })

  const balloonMaterial = new THREE.MeshStandardMaterial({ color: 0x7dff72, emissive: 0x123c1a, roughness: 0.35 })
  ;[-3.3, 0, 3.3].forEach((x, index) => {
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 10), balloonMaterial.clone())
    balloon.material.color.set(index === 1 ? 0xffb000 : 0x7dff72)
    balloon.material.emissive.set(index === 1 ? 0x513200 : 0x123c1a)
    balloon.position.set(x, 8.1 + (index % 2) * 0.8, 0)
    group.add(balloon)

    const stringGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 6.95 + (index % 2) * 0.8, 0),
      new THREE.Vector3(x * 0.38, 2.65, 0),
    ])
    group.add(new THREE.Line(stringGeometry, new THREE.LineBasicMaterial({ color: 0xe9ffe7, transparent: true, opacity: 0.7 })))
  })

  return group
}

function App() {
  const mountRef = useRef(null)
  const popupsRef = useRef(null)
  const restartRef = useRef(null)
  const quitRef = useRef(null)
  const musicControlsRef = useRef(null)
  const mobileControlsRef = useRef({ stickX: 0, stickY: 0, boost: false, fire: false })
  const [inputMode, setInputMode] = useState('auto')
  const [touchLikely, setTouchLikely] = useState(() => detectTouchLikely())
  const [hud, setHud] = useState({ score: 0, speed: 0, altitude: 0, hits: 0, ammo: MAX_AMMO, crashed: false, started: false })
  const [highScores, setHighScores] = useState(() => readHighScores())
  const [initials, setInitials] = useState('ACE')
  const [scoreSubmitted, setScoreSubmitted] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(() => readMusicPreference())
  const musicEnabledRef = useRef(musicEnabled)

  const highScore = highScores[0]?.score || 0
  const showTouchControls = hud.started && !hud.crashed && (inputMode === 'touch' || (inputMode === 'auto' && touchLikely))

  useEffect(() => {
    musicEnabledRef.current = musicEnabled
    writeMusicPreference(musicEnabled)
    if (musicEnabled) {
      musicControlsRef.current?.start()
    } else {
      musicControlsRef.current?.stop()
    }
  }, [musicEnabled])

  useEffect(() => {
    function updateTouchDetection() {
      setTouchLikely(detectTouchLikely())
    }
    updateTouchDetection()
    window.addEventListener('resize', updateTouchDetection)
    return () => window.removeEventListener('resize', updateTouchDetection)
  }, [])

  // Tilt/device-orientation controls are intentionally disabled for now.
  // They need more tuning than is polite to inflict on thumbs and furniture.

  function updateStickFromPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    const length = Math.hypot(x, y) || 1
    const limit = Math.min(1, length)
    mobileControlsRef.current.stickX = (x / length) * limit
    mobileControlsRef.current.stickY = (y / length) * limit
    event.currentTarget.style.setProperty('--stick-x', String(mobileControlsRef.current.stickX))
    event.currentTarget.style.setProperty('--stick-y', String(mobileControlsRef.current.stickY))
  }

  function releaseStick(event) {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    mobileControlsRef.current.stickX = 0
    mobileControlsRef.current.stickY = 0
    event.currentTarget.style.setProperty('--stick-x', '0')
    event.currentTarget.style.setProperty('--stick-y', '0')
  }

  function setTouchButton(button, pressed) {
    mobileControlsRef.current[button] = pressed
  }

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

  function quitToTitle() {
    musicEnabledRef.current = false
    setMusicEnabled(false)
    musicControlsRef.current?.reset()
    setInputMode('auto')
    setInitials('ACE')
    setScoreSubmitted(false)
    quitRef.current?.()
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
      ammo: MAX_AMMO,
      started: false,
      crashed: false,
      lastTime: performance.now(),
      hudTime: 0,
      fireCooldown: 0,
      crashModalDelay: 0,
      countdown: 0,
      countdownCueIndex: 0,
      mouseX: 0,
      mouseY: 0,
    }

    const keys = new Set()
    const buildings = new Map()
    const bullets = []
    const targets = []
    const ammoCrates = []
    const explosions = []
    const crashPieces = []
    const popups = []
    const countdownMarkers = []
    const speedLines = []
    const spacing = 34
    const worldUp = new THREE.Vector3(0, 1, 0)
    const visualTarget = new THREE.Vector3()
    const tempVector = new THREE.Vector3()
    const previousPlanePosition = new THREE.Vector3()
    const cameraViewProjection = new THREE.Matrix4()
    const cameraFrustum = new THREE.Frustum()
    const targetSphere = new THREE.Sphere()
    const audio = { context: null, master: null, track: null, musicPlaying: false, unlocked: false }

    function getAudioContext() {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      if (!audio.context) {
        audio.context = new AudioContext()
        audio.master = audio.context.createGain()
        audio.master.gain.value = 0.38
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

    function playAmmoPickupSound() {
      playTone({ frequency: 523, endFrequency: 660, type: 'triangle', gain: 0.16, duration: 0.1 })
      playTone({ frequency: 659, endFrequency: 880, type: 'triangle', gain: 0.17, duration: 0.14, delay: 0.06 })
      playTone({ frequency: 784, endFrequency: 1175, type: 'square', gain: 0.11, duration: 0.2, delay: 0.12 })
      playNoise({ gain: 0.08, duration: 0.17, delay: 0.04, lowpass: 6200 })
    }

    function playCrashSound() {
      playNoise({ gain: 0.5, duration: 0.85, lowpass: 2400 })
      playNoise({ gain: 0.28, duration: 0.38, delay: 0.08, lowpass: 5600 })
      playTone({ frequency: 95, endFrequency: 34, type: 'sawtooth', gain: 0.32, duration: 0.78 })
      playTone({ frequency: 55, endFrequency: 28, type: 'square', gain: 0.22, duration: 0.9, delay: 0.05 })
    }

    function playCountdownSound(label) {
      if (label === 'GO!') {
        playTone({ frequency: 660, endFrequency: 1320, type: 'square', gain: 0.2, duration: 0.18 })
        playTone({ frequency: 990, endFrequency: 1760, type: 'triangle', gain: 0.16, duration: 0.24, delay: 0.08 })
        playNoise({ gain: 0.08, duration: 0.16, delay: 0.02, lowpass: 5200 })
        return
      }
      const base = label === '3' ? 330 : label === '2' ? 392 : 494
      playTone({ frequency: base, endFrequency: base * 1.18, type: 'square', gain: 0.16, duration: 0.13 })
      playTone({ frequency: base / 2, endFrequency: base / 2, type: 'triangle', gain: 0.08, duration: 0.12 })
    }

    function startMusic() {
      if (!musicEnabledRef.current || audio.musicPlaying) return
      if (!audio.track) {
        audio.track = new Audio(MUSIC_TRACK_URL)
        audio.track.loop = true
        audio.track.preload = 'auto'
        audio.track.volume = 0.28
      }
      audio.musicPlaying = true
      audio.track.currentTime = audio.track.currentTime || 0
      const playPromise = audio.track.play()
      if (playPromise?.catch) {
        playPromise.catch(() => {
          audio.musicPlaying = false
        })
      }
    }

    function stopMusic() {
      audio.musicPlaying = false
      if (audio.track) {
        audio.track.pause()
      }
    }

    function resetMusic() {
      stopMusic()
      if (audio.track) audio.track.currentTime = 0
    }

    musicControlsRef.current = {
      start: () => {
        getAudioContext()
        startMusic()
      },
      stop: stopMusic,
      reset: resetMusic,
    }

    function makeTextTexture(text, color = '#ffffff') {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 256
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.font = text === 'GO!' ? '900 112px Arial Black, Impact, sans-serif' : '900 164px Arial Black, Impact, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.lineWidth = 16
      context.strokeStyle = '#130722'
      context.shadowColor = color
      context.shadowBlur = 34
      context.strokeText(text, 256, 130)
      context.fillStyle = color
      context.fillText(text, 256, 130)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      return texture
    }

    function setupCountdownMarkers() {
      countdownMarkers.splice(0).forEach((marker) => {
        effectGroup.remove(marker.mesh)
        marker.mesh.material.map.dispose()
        marker.mesh.material.dispose()
      })
      const markers = [
        { text: '3', distance: 54, color: '#16f7ff' },
        { text: '2', distance: 100, color: '#ff2bd6' },
        { text: '1', distance: 146, color: '#ffb000' },
        { text: 'GO!', distance: 194, color: '#ffffff' },
      ]
      const forward = getForwardVector(false)
      markers.forEach((marker) => {
        const material = new THREE.SpriteMaterial({ map: makeTextTexture(marker.text, marker.color), transparent: true, depthWrite: false })
        const sprite = new THREE.Sprite(material)
        sprite.position.copy(state.position).addScaledVector(forward, marker.distance)
        sprite.position.y += marker.text === 'GO!' ? 4 : 1
        sprite.scale.set(marker.text === 'GO!' ? 34 : 24, marker.text === 'GO!' ? 17 : 12, 1)
        effectGroup.add(sprite)
        countdownMarkers.push({ mesh: sprite, distance: marker.distance })
      })
    }

    function updateCountdownMarkers() {
      const forward = getForwardVector(false)
      countdownMarkers.forEach((marker) => {
        const toMarker = tempVector.copy(marker.mesh.position).sub(state.position)
        const ahead = toMarker.dot(forward)
        marker.mesh.material.opacity = clamp((ahead + 10) / 44, 0, 1)
        marker.mesh.scale.multiplyScalar(ahead < 12 ? 1.018 : 1)
      })
    }

    function setupSpeedLines() {
      speedLines.splice(0).forEach((line) => effectGroup.remove(line.mesh))
      for (let i = 0; i < 72; i += 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)])
        const material = new THREE.LineBasicMaterial({ color: i % 3 === 0 ? 0xff2bd6 : i % 3 === 1 ? 0x16f7ff : 0xffb000, transparent: true, opacity: 0 })
        const mesh = new THREE.Line(geometry, material)
        effectGroup.add(mesh)
        speedLines.push({ mesh, offset: new THREE.Vector3(), seed: Math.random() })
      }
    }

    function resetSpeedLine(line, boostFactor = 1) {
      const forward = getForwardVector(false)
      const right = getRightVector()
      const up = worldUp
      const lateral = lerp(-58, 58, Math.random())
      const vertical = lerp(-24, 34, Math.random())
      const ahead = lerp(44, 180 + boostFactor * 35, Math.random())
      line.offset.copy(state.position).addScaledVector(forward, ahead).addScaledVector(right, lateral).addScaledVector(up, vertical)
    }

    function updateSpeedLines(dt, boostActive = false) {
      const forward = getForwardVector(false)
      const boostFactor = boostActive ? 1.9 : 1
      const activeCount = boostActive ? speedLines.length : 42
      speedLines.forEach((line, index) => {
        if (line.offset.lengthSq() === 0 || index >= activeCount) resetSpeedLine(line, boostFactor)
        const extraSpeed = (boostActive ? 108 : 42) + line.seed * 38
        line.offset.addScaledVector(forward, -(state.speed + extraSpeed) * dt)
        const toLine = tempVector.copy(line.offset).sub(state.position)
        if (toLine.dot(forward) < -26 || toLine.lengthSq() > 230 * 230) resetSpeedLine(line, boostFactor)
        const start = line.offset
        const end = line.offset.clone().addScaledVector(forward, -(boostActive ? 13 : 7) * (0.7 + line.seed))
        line.mesh.geometry.setFromPoints([start, end])
        line.mesh.material.opacity = index < activeCount ? (boostActive ? 0.72 : 0.34) : 0
      })
    }

    function clearGameplayObjects() {
      bullets.splice(0).forEach((bullet) => effectGroup.remove(bullet.mesh))
      targets.splice(0).forEach((target) => targetGroup.remove(target.mesh))
      ammoCrates.splice(0).forEach((crate) => targetGroup.remove(crate.mesh))
      explosions.splice(0).forEach((particle) => effectGroup.remove(particle.mesh))
      crashPieces.splice(0).forEach((piece) => effectGroup.remove(piece.mesh))
      popups.splice(0).forEach((popup) => popup.element.remove())
      countdownMarkers.splice(0).forEach((marker) => {
        effectGroup.remove(marker.mesh)
        marker.mesh.material.map.dispose()
        marker.mesh.material.dispose()
      })
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
      state.ammo = MAX_AMMO
      state.fireCooldown = 0
      state.crashModalDelay = 0
      state.countdown = 3.7
      state.countdownCueIndex = 0
      state.started = true
      state.crashed = false
      state.lastTime = performance.now()
      plane.visible = true
      setScoreSubmitted(false)
      setupCountdownMarkers()
      setHud({ score: 0, speed: state.speed, altitude: state.position.y, hits: 0, ammo: state.ammo, crashed: false, started: true })
    }

    restartRef.current = resetGame

    function returnToTitle() {
      clearGameplayObjects()
      keys.clear()
      Object.assign(mobileControlsRef.current, { stickX: 0, stickY: 0, boost: false, fire: false })
      state.position.set(0, 28, 16)
      previousPlanePosition.copy(state.position)
      state.yaw = 0
      state.pitch = 0
      state.roll = 0
      state.speed = 42
      state.score = 0
      state.hits = 0
      state.ammo = MAX_AMMO
      state.fireCooldown = 0
      state.crashModalDelay = 0
      state.countdown = 0
      state.countdownCueIndex = 0
      state.mouseX = 0
      state.mouseY = 0
      state.started = false
      state.crashed = false
      state.lastTime = performance.now()
      plane.visible = true
      setHud({ score: 0, speed: state.speed, altitude: state.position.y, hits: 0, ammo: state.ammo, crashed: false, started: false })
    }

    quitRef.current = returnToTitle

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

    function addPopup(position, text, className = 'score-pop') {
      if (!popupLayer) return
      const element = document.createElement('div')
      element.className = className
      element.textContent = text
      popupLayer.appendChild(element)
      popups.push({ element, position: position.clone(), age: 0, ttl: 1.15 })
    }

    function addScorePopup(position, points) {
      addPopup(position, `+${points}!`)
    }

    function addAmmoPopup(position) {
      addPopup(position, 'AMMO FULL!', 'score-pop ammo-pop')
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

    function createAmmoBurst(position) {
      const colors = [0x7dff72, 0xffb000, 0x16f7ff, 0xffffff, 0xff2bd6]
      for (let index = 0; index < 38; index += 1) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.38 + Math.random() * 0.65, 0.25 + Math.random() * 0.68, 0.3 + Math.random() * 0.56),
          new THREE.MeshBasicMaterial({ color: colors[index % colors.length], transparent: true, opacity: 1 }),
        )
        mesh.position.copy(position)
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
        effectGroup.add(mesh)
        explosions.push({
          mesh,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 54, Math.random() * 38 + 7, (Math.random() - 0.5) * 54),
          ttl: 0.82,
          age: 0,
        })
      }
    }

    function placeAmmoCrate(crate, preferAhead = true) {
      const forward = getForwardVector(false)
      const right = getRightVector()
      const slot = crate.mesh.userData.slot
      const openingCrate = slot === 0
      const distance = openingCrate ? 270 : preferAhead ? lerp(150, 480, Math.random()) : lerp(95, 360, Math.random())
      const lateral = openingCrate ? 58 : lerp(-120, 120, Math.random())
      const vertical = openingCrate ? clamp(state.position.y + 5, 24, 54) : lerp(19, 56, Math.random())
      crate.mesh.position.copy(state.position)
      crate.mesh.position.addScaledVector(forward, distance)
      crate.mesh.position.addScaledVector(right, lateral)
      crate.mesh.position.y = vertical
      crate.mesh.userData.wobble = Math.random() * Math.PI * 2
    }

    function spawnAmmoCrate(preferAhead = true) {
      const mesh = createAmmoCrate()
      mesh.userData.slot = ammoCrates.length
      const crate = { mesh, radius: 7.4 }
      placeAmmoCrate(crate, preferAhead)
      targetGroup.add(mesh)
      ammoCrates.push(crate)
    }

    function maintainAmmoCrates() {
      while (ammoCrates.length < 3) spawnAmmoCrate(true)

      const forward = getForwardVector(false)
      for (const crate of ammoCrates) {
        const toCrate = tempVector.copy(crate.mesh.position).sub(state.position)
        const behind = toCrate.dot(forward) < -90
        const tooFar = toCrate.lengthSq() > 620 * 620
        if (behind || tooFar || crate.mesh.position.y < 6) placeAmmoCrate(crate, true)
        crate.mesh.userData.wobble += 0.025
        crate.mesh.position.y += Math.sin(crate.mesh.userData.wobble) * 0.022
        crate.mesh.lookAt(camera.position)
      }
    }

    function collectAmmoCrate(crate) {
      state.ammo = MAX_AMMO
      playAmmoPickupSound()
      createAmmoBurst(crate.mesh.position)
      addAmmoPopup(crate.mesh.position)
      placeAmmoCrate(crate, true)
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

    function checkAmmoCrateFlyThrough() {
      const planeRadius = 2.35
      const path = tempVector.copy(state.position).sub(previousPlanePosition)
      const pathLengthSq = path.lengthSq()
      for (const crate of ammoCrates) {
        const combinedRadius = crate.radius + planeRadius
        let closestDistanceSq
        if (pathLengthSq > 0.0001) {
          const t = clamp(crate.mesh.position.clone().sub(previousPlanePosition).dot(path) / pathLengthSq, 0, 1)
          closestDistanceSq = previousPlanePosition.clone().addScaledVector(path, t).distanceToSquared(crate.mesh.position)
        } else {
          closestDistanceSq = state.position.distanceToSquared(crate.mesh.position)
        }
        if (closestDistanceSq < combinedRadius * combinedRadius) {
          collectAmmoCrate(crate)
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
      maintainAmmoCrates()

      const mobile = mobileControlsRef.current
      const throttle = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobile.boost

      if (state.started && !state.crashed) {
        const countingDown = state.countdown > 0

        if (countingDown) {
          state.countdown = Math.max(0, state.countdown - dt)
          const countdownCues = [
            { at: 3, label: '3' },
            { at: 2, label: '2' },
            { at: 1, label: '1' },
            { at: 0.05, label: 'GO!' },
          ]
          while (state.countdownCueIndex < countdownCues.length && state.countdown <= countdownCues[state.countdownCueIndex].at) {
            playCountdownSound(countdownCues[state.countdownCueIndex].label)
            state.countdownCueIndex += 1
          }
          previousPlanePosition.copy(state.position)
          state.speed = lerp(state.speed, 48, 1 - Math.pow(0.001, dt))
          const forward = getForwardVector(true)
          state.position.addScaledVector(forward, state.speed * dt)
          updateCountdownMarkers()
        } else {
          const left = keys.has('ArrowLeft') || keys.has('KeyA')
          const right = keys.has('ArrowRight') || keys.has('KeyD')
          const up = keys.has('ArrowUp') || keys.has('KeyW')
          const down = keys.has('ArrowDown') || keys.has('KeyS')
          const firing = keys.has('Space') || mobile.fire

          const rollInput = (left ? 1 : 0) + (right ? -1 : 0) - state.mouseX * 0.0015 - mobile.stickX
          const pitchInput = (down ? 1 : 0) + (up ? -1 : 0) - state.mouseY * 0.0017 + mobile.stickY

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

          const firingWithAmmo = firing && state.ammo > 0
          if (firingWithAmmo) state.ammo = Math.max(0, state.ammo - AMMO_DRAIN_PER_SECOND * dt)
          state.fireCooldown = Math.max(0, state.fireCooldown - dt)
          if (firingWithAmmo && state.fireCooldown <= 0) {
            fireGuns()
            state.fireCooldown = 0.085
          }

          checkTargetFlyThrough()
          checkAmmoCrateFlyThrough()

          state.score += dt * state.speed * 0.55
          state.mouseX *= 0.82
          state.mouseY *= 0.82

          if (checkCrash()) {
            updatePlaneVisual()
            state.crashed = true
            state.crashModalDelay = 1.25
            createCrashEffect()
            setHud({ score: Math.floor(state.score), speed: Math.round(state.speed), altitude: Math.round(state.position.y), hits: state.hits, ammo: Math.ceil(state.ammo), crashed: false, started: true })
          }
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
          setHud({ score: Math.floor(state.score), speed: Math.round(state.speed), altitude: Math.round(state.position.y), hits: state.hits, ammo: Math.ceil(state.ammo), crashed: true, started: true })
        }
      }
      ground.position.x = state.position.x
      ground.position.z = state.position.z
      grid.position.x = Math.round(state.position.x / spacing) * spacing
      grid.position.z = Math.round(state.position.z / spacing) * spacing

      updateSpeedLines(dt, throttle && state.countdown <= 0 && !state.crashed)
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
          ammo: Math.ceil(state.ammo),
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
      if (!isTextEntry && state.crashed) {
        if (event.code === 'Space') resetGame()
        return
      }
      if (!isTextEntry) keys.add(event.code)
      if (!isTextEntry && !state.started && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) resetGame()
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

    setupSpeedLines()
    setHud({ score: 0, speed: state.speed, altitude: state.position.y, hits: 0, ammo: state.ammo, crashed: false, started: false })
    rafId = requestAnimationFrame(animate)

    return () => {
      isAlive = false
      cancelAnimationFrame(rafId)
      restartRef.current = null
      quitRef.current = null
      clearGameplayObjects()
      musicControlsRef.current = null
      stopMusic()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('click', onClick)
      speedLines.splice(0).forEach((line) => {
        effectGroup.remove(line.mesh)
        line.mesh.geometry.dispose()
        line.mesh.material.dispose()
      })
      if (audio.track) {
        audio.track.pause()
        audio.track.src = ''
      }
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
        <div className="ammo-readout">
          <span className="label">AMMO</span>
          <strong>{hud.ammo}</strong>
          <span className="ammo-meter" aria-label={`${hud.ammo} of ${MAX_AMMO} ammo`}>
            <span style={{ width: `${(hud.ammo / MAX_AMMO) * 100}%` }} />
          </span>
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

      <section className={`mobile-controls ${showTouchControls ? 'is-visible' : ''}`} aria-label="Mobile flight controls">
        <div
          className="virtual-stick"
          role="application"
          aria-label="Virtual flight stick"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId)
            updateStickFromPointer(event)
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) updateStickFromPointer(event)
          }}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
        >
          <span className="stick-knob" aria-hidden="true" />
        </div>

        <div className="touch-actions">
          <button
            type="button"
            className="touch-button shoot-button"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setTouchButton('fire', true) }}
            onPointerUp={(event) => { event.currentTarget.releasePointerCapture?.(event.pointerId); setTouchButton('fire', false) }}
            onPointerCancel={() => setTouchButton('fire', false)}
          >
            Shoot
          </button>
          <button
            type="button"
            className="touch-button boost-button"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setTouchButton('boost', true) }}
            onPointerUp={(event) => { event.currentTarget.releasePointerCapture?.(event.pointerId); setTouchButton('boost', false) }}
            onPointerCancel={() => setTouchButton('boost', false)}
          >
            Boost
          </button>
        </div>
      </section>

      {!hud.started && (
        <section className="start-screen" aria-label="Start Stratus">
          <div className="start-card">
            <span className="label">stratus flight check</span>
            <h1>Ready for launch?</h1>
            <p className="start-copy">Pop targets, thread the neon city, avoid converting the aircraft into modern art.</p>
            <div className="control-legend">
              <p><strong>Keyboard:</strong> W/S pitch · A/D or arrows bank · Shift boost · Space guns</p>
              <p><strong>Ammo:</strong> 300 rounds lasts three seconds of continuous fire. Fly through balloon crates to fully reload.</p>
              <p><strong>Touch:</strong> left stick steers · Shoot and Boost buttons on the right</p>
            </div>
            <div className="input-choice" aria-label="Control mode">
              <button type="button" className={inputMode === 'auto' ? 'selected' : ''} onClick={() => setInputMode('auto')}>Auto {touchLikely ? 'touch' : 'keyboard'}</button>
              <button type="button" className={inputMode === 'touch' ? 'selected' : ''} onClick={() => setInputMode('touch')}>Touch</button>
              <button type="button" className={inputMode === 'keyboard' ? 'selected' : ''} onClick={() => setInputMode('keyboard')}>Keyboard</button>
            </div>
            <button type="button" className="start-button" onClick={() => restartRef.current?.()}>Press to start</button>
            <p className="music-credit">Music: <a href="https://github.com/OpenSourceMusic/This-Place-Is-So-Lonely" target="_blank" rel="noreferrer">This Place Is So Lonely</a> by Josh Penn-Pierson · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
          </div>
        </section>
      )}

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

            <button type="button" onClick={() => restartRef.current?.()}>FLY AGAIN</button>
            <button type="button" className="quit-button" onClick={quitToTitle}>QUIT</button>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
