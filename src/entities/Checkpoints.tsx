import { useRef } from "react"
import type { RefObject } from "react"

import { Torus } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette } from "@/game/gameConfig"
import { resolveRelativeTrackCenter } from "@/game/trackPath"
import type { Checkpoint } from "@/shared/types"

interface CheckpointsProps {
  checkpoints: Checkpoint[]
  distanceRef: RefObject<number>
}

interface CheckpointNodeProps {
  checkpoint: Checkpoint
  distanceRef: RefObject<number>
}

function CheckpointNode({ checkpoint, distanceRef }: CheckpointNodeProps) {
  const checkpointRef = useRef<Group | null>(null)

  useFrame(() => {
    const checkpointGroup = checkpointRef.current
    if (!checkpointGroup) return

    const distance = distanceRef.current
    const z = -(checkpoint.distance - distance) + 2
    const x = resolveRelativeTrackCenter(checkpoint.distance, distance)

    checkpointGroup.position.set(x, 2.8, z)
    checkpointGroup.visible = z <= 20 && z >= -260
  })

  return (
    <group ref={checkpointRef} rotation={[0, 0, Math.PI / 2]}>
      <Torus args={[checkpoint.width / 2, 0.06, 10, 96]}>
        <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.88} />
      </Torus>
    </group>
  )
}

export function Checkpoints({ checkpoints, distanceRef }: CheckpointsProps) {
  return (
    <group>
      {checkpoints.map((checkpoint) => (
        <CheckpointNode key={checkpoint.id} checkpoint={checkpoint} distanceRef={distanceRef} />
      ))}
    </group>
  )
}
