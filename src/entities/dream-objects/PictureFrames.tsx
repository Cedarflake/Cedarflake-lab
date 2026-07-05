import { Suspense, useEffect, useMemo, useRef } from "react"
import type { RefObject } from "react"

import { useFrame, useLoader } from "@react-three/fiber"
import { DoubleSide, MeshBasicMaterial, SRGBColorSpace, TextureLoader } from "three"
import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, trackConfig } from "@/game/gameConfig"

import { createSideSceneryItems, resolveSceneryZ } from "./shared"

interface PictureFramesProps {
  distanceRef: RefObject<number>
}

interface PictureFrameNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const pictureFrameCycleDistance = 680
const pictureFrameTextureAspect = 235 / 286
const pictureFrameVisualHeight = 2.92
const pictureFrameVisualWidth = pictureFrameVisualHeight * pictureFrameTextureAspect
const pictureFrameOuterWidth = pictureFrameVisualWidth + 0.44
const pictureFrameOuterHeight = pictureFrameVisualHeight + 0.44
const pictureFrameRailThickness = 0.16

function PictureFrameImage() {
  const texture = useLoader(TextureLoader, "/image/image.png")
  const material = useMemo(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true

    return new MeshBasicMaterial({
      depthWrite: true,
      map: texture,
      opacity: 1,
      side: DoubleSide,
      toneMapped: false,
    })
  }, [texture])

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  return (
    <mesh position={[0, 0, 0.08]} scale={[pictureFrameVisualWidth, pictureFrameVisualHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <primitive attach="material" object={material} />
    </mesh>
  )
}

function PictureFramePlaceholder() {
  return (
    <mesh position={[0, 0, 0.06]} scale={[pictureFrameVisualWidth, pictureFrameVisualHeight, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#6e5960" depthWrite={false} transparent opacity={0.82} />
    </mesh>
  )
}

function PictureFrameChrome({ index }: { index: number }) {
  const frameTint = index % 2 === 0 ? dreamPalette.ruin : dreamPalette.ruinDark

  return (
    <>
      <mesh position={[0, pictureFrameOuterHeight / 2, 0]}>
        <boxGeometry args={[pictureFrameOuterWidth, pictureFrameRailThickness, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.78} />
      </mesh>
      <mesh position={[0, -pictureFrameOuterHeight / 2, 0]}>
        <boxGeometry args={[pictureFrameOuterWidth, pictureFrameRailThickness, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.8} />
      </mesh>
      <mesh position={[-pictureFrameOuterWidth / 2, 0, 0]}>
        <boxGeometry args={[pictureFrameRailThickness, pictureFrameOuterHeight, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.82} />
      </mesh>
      <mesh position={[pictureFrameOuterWidth / 2, 0, 0]}>
        <boxGeometry args={[pictureFrameRailThickness, pictureFrameOuterHeight, 0.1]} />
        <meshStandardMaterial color={frameTint} roughness={0.82} />
      </mesh>
      <mesh
        position={[0, 0, -0.045]}
        scale={[pictureFrameVisualWidth + 0.12, pictureFrameVisualHeight + 0.12, 1]}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#5a454b" depthWrite={false} transparent opacity={0.58} />
      </mesh>
      <mesh position={[-0.46, 0.42, 0.1]}>
        <boxGeometry args={[0.5, 0.06, 0.035]} />
        <meshBasicMaterial color={dreamPalette.lemon} transparent opacity={0.44} />
      </mesh>
      <mesh position={[0.34, -0.52, 0.1]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.68, 0.06, 0.035]} />
        <meshBasicMaterial color={dreamPalette.mint} transparent opacity={0.38} />
      </mesh>
    </>
  )
}

function PictureFrameNode({ index, nodeRef }: PictureFrameNodeProps) {
  return (
    <group ref={nodeRef} scale={0.82 + (index % 3) * 0.13}>
      <PictureFrameChrome index={index} />
      <Suspense fallback={<PictureFramePlaceholder />}>
        <PictureFrameImage />
      </Suspense>
    </group>
  )
}

export function PictureFrames({ distanceRef }: PictureFramesProps) {
  const pictureFrameRefs = useRef<Array<Group | null>>([])
  const pictureFrames = useMemo(() => createSideSceneryItems(7), [])

  useFrame(({ camera }) => {
    const distance = distanceRef.current

    pictureFrames.forEach(({ index, side }) => {
      const pictureFrame = pictureFrameRefs.current[index]
      if (!pictureFrame) return

      const z = resolveSceneryZ(126 + index * 91, distance, 0.48, pictureFrameCycleDistance)
      const phase = distance * 0.018 + index * 1.37
      const sideBand = index % 3
      const x =
        side * (trackConfig.roadHalfWidth + 4.6 + sideBand * 1.8 + Math.sin(phase * 0.7) * 0.72)
      const groundY = resolveDesertGroundHeight(x, z)
      const flicker = Math.sin(distance * 0.045 + index * 2.2) > 0.72

      pictureFrame.position.set(x, groundY + 2.35, z)
      pictureFrame.lookAt(camera.position.x, pictureFrame.position.y, camera.position.z)
      pictureFrame.visible = flicker && z < 10 && z > -150
    })
  })

  return (
    <>
      {pictureFrames.map(({ index }) => (
        <PictureFrameNode
          key={index}
          index={index}
          nodeRef={(node) => {
            pictureFrameRefs.current[index] = node
          }}
        />
      ))}
    </>
  )
}
