import { Suspense, useEffect, useMemo } from "react"
import type { RefObject } from "react"

import { useLoader } from "@react-three/fiber"
import { DoubleSide, MeshBasicMaterial, SRGBColorSpace, TextureLoader } from "three"
import type { Group } from "three"

import { resolveDesertGroundHeight } from "@/game/desertTerrain"
import { dreamPalette, sceneryConfig, trackConfig } from "@/game/gameConfig"

import { createSideSceneryItems } from "./shared"
import { useScrollingScenery } from "./useScrollingScenery"

interface PictureFramesProps {
  distanceRef: RefObject<number>
}

interface PictureFrameNodeProps {
  index: number
  nodeRef: (node: Group | null) => void
}

const pictureFrameTextureAspect = 235 / 286
const pictureFrameVisualHeight = 2.92
const pictureFrameVisualWidth = pictureFrameVisualHeight * pictureFrameTextureAspect
const pictureFrameOuterWidth = pictureFrameVisualWidth + 0.44
const pictureFrameOuterHeight = pictureFrameVisualHeight + 0.44
const pictureFrameRailThickness = 0.16
const { pictureFrames } = sceneryConfig

function resolvePictureFrameFlicker(distance: number, index: number) {
  const { flicker } = pictureFrames

  return (
    Math.sin(distance * flicker.distanceSpeed + index * flicker.phaseStride) >
    flicker.visibleThreshold
  )
}

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
  const pictureFrameItems = useMemo(() => createSideSceneryItems(pictureFrames.count), [])
  const setPictureFrameRef = useScrollingScenery({
    cycleDistance: pictureFrames.cycleDistance,
    distanceRef,
    items: pictureFrameItems,
    originDistance: ({ index }) => pictureFrames.originStart + index * pictureFrames.spacing,
    speed: pictureFrames.speed,
    visibilityRange: pictureFrames.visibility,
    update: ({ camera, distance, item, node, z }) => {
      const { index, side } = item
      const phase = distance * pictureFrames.phaseDistanceSpeed + index * pictureFrames.phaseStride
      const sideBand = index % pictureFrames.sideBandCount
      const x =
        side *
        (trackConfig.roadHalfWidth +
          pictureFrames.baseSideOffset +
          sideBand * pictureFrames.sideBandOffset +
          Math.sin(phase * pictureFrames.swaySpeed) * pictureFrames.swayAmplitude)
      const groundY = resolveDesertGroundHeight(x, z)

      node.position.set(x, groundY + pictureFrames.groundOffset, z)
      node.lookAt(camera.position.x, node.position.y, camera.position.z)
      node.visible = node.visible && resolvePictureFrameFlicker(distance, index)
    },
  })

  return (
    <>
      {pictureFrameItems.map(({ index }) => (
        <PictureFrameNode
          key={index}
          index={index}
          nodeRef={(node) => {
            setPictureFrameRef(index, node)
          }}
        />
      ))}
    </>
  )
}
