"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Edges, OrbitControls } from "@react-three/drei"
import { useMemo, useRef } from "react"
import type { Group } from "three"

const TONE: Record<string, string> = {
  neutral: "#FAFAF7",
  approved: "#4ADE80",
  denied: "#F87171",
}

const W = 1.6
const H = 2.4
const D = 1.6

function Liquid({ ratio, color }: { ratio: number; color: string }) {
  const clamped = Math.max(0, Math.min(1, ratio))
  // grow from the bottom: scale the unit box and shift it up by half its height
  const h = Math.max(0.0001, clamped * H)
  const y = -H / 2 + h / 2
  return (
    <mesh position={[0, y, 0]} scale={[W * 0.92, h, D * 0.92]}>
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

function TankMesh({ ratio, color, spin }: { ratio: number; color: string; spin: boolean }) {
  const ref = useRef<Group>(null)
  useFrame((_, delta) => {
    if (spin && ref.current) ref.current.rotation.y += delta * 0.35
  })
  return (
    <group ref={ref} rotation={[0, -0.5, 0]}>
      {/* glass container */}
      <mesh>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial color="#0A0A0A" transparent opacity={0.12} roughness={0.1} />
        <Edges color="#8A8A84" />
      </mesh>
      <Liquid ratio={ratio} color={color} />
    </group>
  )
}

export default function WebglTank({
  ratio,
  tone,
  color,
  interactive = false,
}: {
  ratio: number
  tone?: string
  color?: string
  interactive?: boolean
}) {
  // explicit color wins; otherwise fall back to the tone palette
  const resolved = color ?? TONE[tone ?? "neutral"] ?? TONE.neutral
  const key = useMemo(() => resolved, [resolved])
  return (
    <Canvas key={key} camera={{ position: [3.4, 2.6, 3.8], fov: 38 }} dpr={[1, 2]}>
      <color attach="background" args={["#0A0A0A"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} />
      <directionalLight position={[-5, 2, -4]} intensity={0.5} />
      <pointLight position={[0, 3, 2]} intensity={12} />
      <TankMesh ratio={ratio} color={resolved} spin={!interactive} />
      {interactive && <OrbitControls enablePan={false} minDistance={3} maxDistance={9} />}
    </Canvas>
  )
}
