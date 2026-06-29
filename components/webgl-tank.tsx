"use client"

import { Canvas } from "@react-three/fiber"
import { Edges, OrbitControls } from "@react-three/drei"
import { useMemo } from "react"

export type TankSegment = { amount: number; outcome: "approved" | "denied" }

const TONE: Record<string, string> = {
  neutral: "#FAFAF7",
  approved: "#4ADE80",
  denied: "#F87171",
}
const DENIED = "#F87171"

const W = 1.6
const H = 2.4
const D = 1.6
const GAP = 0.04 // vertical separation between stacked sections (world units)

// one approved section: a solid colored band inset inside the glass
function Section({
  bottom,
  height,
  color,
}: {
  bottom: number
  height: number
  color: string
}) {
  const h = Math.max(0.0001, height - GAP)
  const y = -H / 2 + bottom + h / 2
  return (
    <mesh position={[0, y, 0]} scale={[W * 0.9, h, D * 0.9]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        roughness={0.3}
        metalness={0.05}
        emissive={color}
        emissiveIntensity={0.22}
      />
    </mesh>
  )
}

// a denied attempt: translucent red ghost band sitting on top of the fill
function DeniedGhost({ bottom, height }: { bottom: number; height: number }) {
  const h = Math.max(0.0001, height)
  const y = -H / 2 + bottom + h / 2
  return (
    <mesh position={[0, y, 0]} scale={[W * 0.94, h, D * 0.94]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={DENIED}
        transparent
        opacity={0.35}
        roughness={0.2}
        emissive={DENIED}
        emissiveIntensity={0.5}
      />
      <Edges color={DENIED} />
    </mesh>
  )
}

function TankMesh({
  segments,
  capacity,
  color,
}: {
  segments: TankSegment[]
  capacity: number
  color: string
}) {
  // convert capacity units -> world height, stacking approved sections from the bottom
  const { sections, ghosts } = useMemo(() => {
    const cap = Math.max(capacity, 1)
    const toH = (amt: number) => (amt / cap) * H
    const sec: { bottom: number; height: number }[] = []
    const gh: { bottom: number; height: number }[] = []
    let cum = 0 // current approved fill height in world units
    for (const s of segments) {
      const segH = toH(s.amount)
      if (s.outcome === "approved") {
        if (cum >= H) continue // tank already full
        const clamped = Math.min(segH, H - cum)
        sec.push({ bottom: cum, height: clamped })
        cum += clamped
      } else {
        // denied: ghost band starting at current fill level, clamped to the top
        const ghostH = Math.min(segH, Math.max(0.12, H - cum))
        gh.push({ bottom: cum, height: ghostH })
      }
    }
    return { sections: sec, ghosts: gh }
  }, [segments, capacity])

  return (
    <group rotation={[0, -0.5, 0]}>
      {/* glass container */}
      <mesh>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#0A0A0A" transparent opacity={0.12} roughness={0.1} />
        <Edges color="#8A8A84" />
      </mesh>
      {sections.map((s, i) => (
        <Section key={`s${i}`} bottom={s.bottom} height={s.height} color={color} />
      ))}
      {ghosts.map((g, i) => (
        <DeniedGhost key={`g${i}`} bottom={g.bottom} height={g.height} />
      ))}
    </group>
  )
}

export default function WebglTank({
  segments,
  capacity,
  tone,
  color,
  interactive = false,
}: {
  segments: TankSegment[]
  capacity: number
  tone?: string
  color?: string
  interactive?: boolean
}) {
  // explicit color wins; otherwise fall back to the tone palette
  const resolved = color ?? TONE[tone ?? "neutral"] ?? TONE.neutral
  return (
    <Canvas camera={{ position: [3.4, 2.6, 3.8], fov: 38 }} dpr={[1, 2]}>
      <color attach="background" args={["#0A0A0A"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} />
      <directionalLight position={[-5, 2, -4]} intensity={0.5} />
      <pointLight position={[0, 3, 2]} intensity={12} />
      <TankMesh segments={segments} capacity={capacity} color={resolved} />
      {interactive && <OrbitControls enablePan={false} minDistance={3} maxDistance={9} />}
    </Canvas>
  )
}
