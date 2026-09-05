import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
    cloud_name: process.env.VITE_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.VITE_CLOUDINARY_API_KEY,
    api_secret: process.env.VITE_CLOUDINARY_API_SECRET,
    signature_algorithm: 'sha256' // Requirement: Secure uploads with SHA-256
});

/**
 * Uploads media (image or video) directly to Cloudinary.
 * @param {string} file - Local path or base64 string.
 * @param {string} droneId - ID of the drone that captured the media.
 * @param {string} missionId - Current mission ID.
 * @param {string} type - 'image' or 'video'
 */
export async function uploadDroneMedia(file, droneId, missionId, type = 'image') {
    const timestamp = Date.now();
    const folderPath = `drones/${droneId}/${missionId}/${type}s`;

    // Formatted timestamp for filename
    const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
    const publicId = `capture_${dateStr}`;

    const options = {
        folder: folderPath,
        public_id: publicId,
        type: 'authenticated', // Strict access control (private delivery)
        resource_type: type === 'video' ? 'video' : 'image',
        context: `captured_at=${timestamp}|drone=${droneId}|mission=${missionId}`
    };

    try {
        const result = await cloudinary.uploader.upload(file, options);
        console.log(`[CLOUDINARY] Securely uploaded ${type} to ${result.secure_url}`);
        return result;
    } catch (error) {
        console.error('[CLOUDINARY ERROR] Upload failed:', error);
        throw error;
    }
}

/**
 * Generates a self-destructing, IP-bound URL for accessing the media.
 * @param {string} publicId - The Cloudinary public ID (including folder path).
 * @param {string} ipAddress - The user's IP address to cryptographically bind the URL to.
 * @param {string} resourceType - 'image' or 'video'
 */
export function generateSecureMediaUrl(publicId, ipAddress, resourceType = 'image') {
    // 5-minute expiration timestamp (UNIX)
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 300;

    // Generate token-based authentication URL
    const url = cloudinary.url(publicId, {
        resource_type: resourceType,
        type: 'authenticated',
        secure: true,
        auth_token: {
            key: process.env.VITE_CLOUDINARY_API_SECRET, // Fallback to secret if custom Auth Key isn't provided
            ip: ipAddress,
            exp: expiryTimestamp
        }
    });

    return url;
}
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
dotenv.config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'dqng4xws1';
const apiKey = process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY || '316269317342895';
const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.VITE_CLOUDINARY_API_SECRET || 'LuEiH4XafGUUSLzn6VJIEyU9hr0';

if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
    });
}

/**
 * Uploads media (image or video) directly to Cloudinary.
 * @param {string} file - Local path or base64 string.
 * @param {string} droneId - ID of the drone that captured the media.
 * @param {string} missionId - Current mission ID.
 * @param {string} type - 'image' or 'video'
 */
export async function uploadDroneMedia(file, droneId, missionId, type = 'image') {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || 'dqng4xws1';
    const apiKey = process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY || '316269317342895';
    const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.VITE_CLOUDINARY_API_SECRET || 'LuEiH4XafGUUSLzn6VJIEyU9hr0';

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
    });

    const timestamp = Date.now();
    const folderPath = `drone_shield_survivors`;
    const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
    const publicId = `survivor_${droneId}_${dateStr}`;

    const options = {
        folder: folderPath,
        public_id: publicId,
        resource_type: type === 'video' ? 'video' : 'image'
    };

    try {
        const result = await cloudinary.uploader.upload(file, options);
        console.log(`[CLOUDINARY] Securely uploaded ${type} to ${result.secure_url}`);
        return result;
    } catch (error) {
        console.error('[CLOUDINARY ERROR] Upload failed:', error);
        throw error;
    }
}

/**
 * Generates a self-destructing, IP-bound URL for accessing the media.
 * @param {string} publicId - The Cloudinary public ID (including folder path).
 * @param {string} ipAddress - The user's IP address to cryptographically bind the URL to.
 * @param {string} resourceType - 'image' or 'video'
 */
export function generateSecureMediaUrl(publicId, ipAddress, resourceType = 'image') {
    // 5-minute expiration timestamp (UNIX)
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 300;

    // Generate token-based authentication URL
    const url = cloudinary.url(publicId, {
        resource_type: resourceType,
        type: 'authenticated',
        secure: true,
        auth_token: {
            key: process.env.VITE_CLOUDINARY_API_SECRET, // Fallback to secret if custom Auth Key isn't provided
            ip: ipAddress,
            exp: expiryTimestamp
        }
    });

    return url;
}
