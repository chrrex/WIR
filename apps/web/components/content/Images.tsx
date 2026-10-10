/* eslint-disable @next/next/no-img-element */
export interface ImageRef { fileId: string; altText: string | null }

export function Images({ images }: { images: ImageRef[] }) {
  if (!images.length) return null;
  return (
    <div className={`images n${Math.min(images.length, 3)}`}>
      {images.map((i) => (
        <a key={i.fileId} href={`/api/v1/files/${i.fileId}`} target="_blank" rel="noreferrer">
          <img src={`/api/v1/files/${i.fileId}`} alt={i.altText ?? 'Foto'} loading="lazy" />
        </a>
      ))}
    </div>
  );
}
