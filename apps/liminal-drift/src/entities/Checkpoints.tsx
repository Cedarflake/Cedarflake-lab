import { useRef } from "react"
import type { RefObject } from "react"

import { Torus } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"

import { dreamPalette, renderWindowConfig } from "@/game/gameConfig"
import { resolveRelativeTrackPose } from "@/game/trackPath"
import type { Checkpoint } from "@/shared/types"

interface CheckpointsProps {
  checkpoints: Checkpoint[]
  distanceRef: RefObject<number>
}

interface CheckpointNodeProps {
  checkpoint: Checkpoint
  nodeRef: (node: Group | null) => void
}

function CheckpointNode({ checkpoint, nodeRef }: CheckpointNodeProps) {
  const ringRadius = checkpoint.width / 2
  const crossY = ringRadius + 0.88

  return (
    <group ref={nodeRef} rotation={[0, 0, Math.PI / 2]}>
      <Torus args={[ringRadius, 0.1, 10, 72]}>
        <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.74} />
      </Torus>
      <Torus args={[ringRadius + 0.2, 0.035, 8, 72]}>
        <meshBasicMaterial color="#fff7bc" transparent opacity={0.9} />
      </Torus>
      <group position={[crossY, 0, 0]}>
        <mesh>
          <boxGeometry args={[1.42, 0.18, 0.08]} />
          <meshBasicMaterial color="#fff1a8" transparent opacity={0.92} />
        </mesh>
        <mesh position={[0.22, 0, 0]}>
          <boxGeometry args={[0.18, 1.06, 0.08]} />
          <meshBasicMaterial color="#fff1a8" transparent opacity={0.92} />
        </mesh>
        <mesh position={[-0.54, 0, 0.01]}>
          <boxGeometry args={[0.46, 0.08, 0.06]} />
          <meshBasicMaterial color={dreamPalette.peach} transparent opacity={0.7} />
        </mesh>
      </group>
    </group>
  )
}

export function Checkpoints({ checkpoints, distanceRef }: CheckpointsProps) {
  const checkpointRefs = useRef<Array<Group | null>>([])

  useFrame(() => {
    const distance = distanceRef.current

    checkpoints.forEach((checkpoint, index) => {
      const checkpointGroup = checkpointRefs.current[index]
      if (!checkpointGroup) return

      const pose = resolveRelativeTrackPose(checkpoint.distance, distance, 2)

      checkpointGroup.position.set(pose.x, 2.8, pose.z)
      checkpointGroup.rotation.set(0, pose.heading, Math.PI / 2)
      checkpointGroup.visible =
        pose.z <= renderWindowConfig.checkpoints.near &&
        pose.z >= renderWindowConfig.checkpoints.far
    })
  })

  return (
    <group>
      {checkpoints.map((checkpoint, index) => (
        <CheckpointNode
          key={checkpoint.id}
          checkpoint={checkpoint}
          nodeRef={(node) => {
            checkpointRefs.current[index] = node
          }}
        />
      ))}
    </group>
  )
}
