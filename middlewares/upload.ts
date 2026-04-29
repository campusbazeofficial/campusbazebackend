import multer from 'multer'
import type { FileFilterCallback } from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import streamifier from 'streamifier'
import type { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary'
import AppError from '../utils/appError.js'
import type { Request } from 'express'

const cloudinaryName = process.env.CLOUDINARY_CLOUD_NAME
const cloudinaryKey = process.env.CLOUDINARY_API_KEY
const cloudinarySecret = process.env.CLOUDINARY_API_SECRET

if (!cloudinaryName || !cloudinaryKey || !cloudinarySecret) {
    throw new Error('Cloudinary environment variables are missing')
}

cloudinary.config({
    cloud_name: cloudinaryName,
    api_key: cloudinaryKey,
    api_secret: cloudinarySecret,
})

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

const VERIFICATION_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
]

export const verificationDocUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — PDFs can be larger
    fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileFilterCallback,
    ) => {
        if (VERIFICATION_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new AppError("Only images (JPEG, PNG, WebP) and PDFs are allowed", 400))
        }
    },
})

// export const uploadToCloudinary = async (
//   fileBuffer: Buffer,
//   folder: string
// ): Promise<UploadApiResponse> => {
//   return new Promise<UploadApiResponse>((resolve, reject) => {
//     const stream = cloudinary.uploader.upload_stream(
//       { folder },
//       (
//         err: UploadApiErrorResponse | undefined,
//         result: UploadApiResponse | undefined
//       ) => {
//         if (err) {
//           reject(new Error(err?.message || "Cloudinary upload failed"));
//           return;
//         }

//         if (!result) {
//           reject(new Error("Cloudinary upload failed: no result returned"));
//           return;
//         }

//         resolve(result);
//       }
//     );

//     streamifier.createReadStream(fileBuffer).pipe(stream);
//   });
// };

export const uploadToCloudinary = async (
    fileBuffer: Buffer,
    folder: string,
    resourceType: 'image' | 'video' | 'raw' = 'image',
): Promise<UploadApiResponse> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
                ...(resourceType === 'raw' && {
                    format: 'pdf',
                }),
            },
            (err, result) => {
                if (err) {
                    reject(
                        new Error(err?.message || 'Cloudinary upload failed'),
                    )
                    return
                }

                if (!result) {
                    reject(
                        new Error(
                            'Cloudinary upload failed: no result returned',
                        ),
                    )
                    return
                }

                resolve(result)
            },
        )

        streamifier.createReadStream(fileBuffer).pipe(stream)
    })
}

// New function — only for KYC/verification documents
// export const uploadVerificationDoc = async (
//     fileBuffer: Buffer,
//     folder: string,
//     mimeType: string,
// ): Promise<UploadApiResponse> => {
//     const isPdf = mimeType === 'application/pdf'

//     return new Promise((resolve, reject) => {
//         const stream = cloudinary.uploader.upload_stream(
//             {
//                 folder,
//                 type: 'authenticated',          // ← blocks direct browser access
//                 resource_type: isPdf ? 'raw' : 'image',
//                 ...(isPdf && { format: 'pdf' }),
//             },
//             (err, result) => {
//                 if (err) reject(new Error(err?.message || 'Cloudinary upload failed'))
//                 else if (!result) reject(new Error('Cloudinary upload failed: no result'))
//                 else resolve(result)
//             },
//         )
//         streamifier.createReadStream(fileBuffer).pipe(stream)
//     })
// }

// In upload.ts
export const uploadVerificationDoc = async (
    fileBuffer: Buffer,
    folder: string,
    mimeType: string,
): Promise<UploadApiResponse> => {
    const isPdf = mimeType === 'application/pdf'

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                type: 'private',          // ← change from 'authenticated' to 'private'
                resource_type: isPdf ? 'raw' : 'image',
                ...(isPdf && { format: 'pdf' }),
            },
            (err, result) => {
                if (err) reject(new Error(err?.message || 'Cloudinary upload failed'))
                else if (!result) reject(new Error('Cloudinary upload failed: no result'))
                else resolve(result)
            },
        )
        streamifier.createReadStream(fileBuffer).pipe(stream)
    })
}

export const deleteVerificationDoc = async (
    publicId: string,
    resourceType: 'image' | 'raw' = 'image',
) => {
    if (!publicId) return null
    return cloudinary.uploader.destroy(publicId, {
        type: 'private', // ✅ FIXED
        resource_type: resourceType,
    })
}

export const deleteFromCloudinary = async (publicId: string) => {
    if (!publicId) return null
    return cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
}
export const deleteVideoFromCloudinary = async (publicId: string) => {
    if (!publicId) return null

    return cloudinary.uploader.destroy(publicId, {
        resource_type: 'video', // 🔥 important
    })
}
type MulterMemoryFile = Express.Multer.File

async function uploadMany(
    files: MulterMemoryFile[],
    folder: string,
): Promise<string[]> {
    const uploads = await Promise.all(
        files.map((f) => uploadToCloudinary(f.buffer, folder)),
    )

    return uploads.map((r) => r.secure_url || r.url).filter(Boolean)
}

export const deleteRawFromCloudinary = async (publicId: string) => {
    if (!publicId) return null

    return cloudinary.uploader.destroy(publicId, {
        resource_type: 'raw', // 🔥 important
    })
}

export const getSignedUrl = (
    publicId: string,
    resourceType: 'image' | 'raw' = 'image',
    expiresInSeconds = 900,
): string => {
    return cloudinary.url(publicId, {
        sign_url: true,
        type: 'private',          // ← match the upload type
        resource_type: resourceType,
        expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
        secure: true,
    })
}
// In upload.ts — add this alongside getSignedUrl
export const getPrivateDownloadUrl = (
    publicId: string,
    resourceType: 'image' | 'raw' = 'image',
    expiresInSeconds = 900,
): string => {
    return cloudinary.utils.private_download_url(
        publicId,
        resourceType === 'raw' ? 'pdf' : 'jpg',
        {
            resource_type: resourceType,
            expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
        }
    )
}

export const uploadPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (
        req: Request,
        file: Express.Multer.File,
        cb: FileFilterCallback,
    ) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true)
        } else {
            cb(new AppError('Only PDF files allowed', 400))
        }
    },
})

export { uploadMany }
