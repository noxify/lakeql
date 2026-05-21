"use client"

import { Eye } from "lucide-react"
import Image from "next/image"

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

interface ImageWithLightboxProps {
  src: string
  alt: string
  width?: number
  height?: number
}

export function ImageWithLightbox({
  src,
  alt,
  width = 0,
  height = 0,
}: ImageWithLightboxProps) {
  return (
    <Dialog>
      {/* Thumbnail/Preview */}
      <section className="my-8">
        <div className="flex items-center justify-center">
          <DialogTrigger
            render={
              <button
                type="button"
                className="group w-full cursor-pointer md:w-3/4"
                aria-label={`${alt} - Click to zoom in`}
              />
            }
          >
            <div className="rounded-md border p-4 transition-all duration-300">
              <div className="relative max-h-96 overflow-hidden rounded-sm">
                <Image
                  src={src}
                  alt={alt}
                  width={width}
                  height={height}
                  style={{ height: "auto", width: "100%" }}
                  className="not-prose object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
                  <div className="rounded-full border border-white/40 bg-white/15 p-3 text-white">
                    <Eye className="h-5 w-5" />
                  </div>
                </div>
                {/* Fade-out overlay at the bottom edge */}
                <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-20 bg-linear-to-t from-black/20 to-transparent" />
              </div>
            </div>
          </DialogTrigger>
        </div>
      </section>

      <DialogContent
        showCloseButton={true}
        className="w-auto max-w-[90vw] bg-transparent p-0 ring-0 sm:max-w-[90vw]"
        aria-label="View image in full size"
      >
        <div className="relative max-h-[90vh] max-w-[90vw]">
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            style={{ height: "auto", width: "100%" }}
            className="not-prose max-h-[90vh] w-auto object-contain"
            priority
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
