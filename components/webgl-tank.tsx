"use client"

import { Canvas } from "@react-three/fiber"
import { Edges, OrbitControls, Environment } from "@react-three/drei"
import { useMemo } from "react"

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
      <meshStandardMaterial color={color} roughness={0.25} metalness={0.1} />
    </mesh>
  )
}

function TankMesh({ ratio, tone }: { ratio: number; tone: string }) {
  const color = TONE[tone] ?? TONE.neutral
  return (
    <group rotation={[0, -0.5, 0]}>
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

export default function WebglTank({ ratio, tone }: { ratio: number; tone: string }) {
  const key = useMemo(() => `${tone}`, [tone])
  return (
    <Canvas key={key} camera={{ position: [3.4, 2.6, 3.8], fov: 38 }} dpr={[1, 2]}>
      <color attach="background" args={["#0A0A0A"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <Environment preset="studio" />
      <TankMesh ratio={ratio} tone={tone} />
      <OrbitControls enablePan={false} minDistance={3} maxDistance={9} />
    </Canvas>
  )
}
