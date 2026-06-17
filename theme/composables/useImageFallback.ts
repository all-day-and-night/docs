import { onMounted } from 'vue'
import { useRouter } from 'vitepress'

const BLOCKED_SRC = '/blocked-image.svg'
const PATCH_ATTR = 'data-fallback-patched'

function patchImages() {
  document.querySelectorAll<HTMLImageElement>(`img:not([${PATCH_ATTR}])`).forEach((img) => {
    img.setAttribute(PATCH_ATTR, '1')
    img.addEventListener('error', () => {
      if (!img.src.endsWith(BLOCKED_SRC)) {
        img.src = BLOCKED_SRC
        img.alt = '접근이 차단된 이미지'
        img.style.minWidth = '200px'
        img.style.minHeight = '120px'
      }
    })
  })
}

export function useImageFallback() {
  const router = useRouter()

  onMounted(() => {
    patchImages()

    const prev = router.onAfterRouteChange
    router.onAfterRouteChange = async (href: string) => {
      await prev?.(href)
      setTimeout(patchImages, 200)
    }
  })
}
