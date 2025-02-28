const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises; // Use promises version of fs

const processImage = async (sourcePath, destinationDir) => {
    try {
        // Ensure destination directory exists
        await fs.mkdir(destinationDir, { recursive: true });

        // Generate unique filename
        const filename = 'category-' + Date.now() + '-' + Math.round(Math.random() * 1E8) + '.jpg';
        const outputPath = path.join(destinationDir, filename);

        // Process image
        await sharp(sourcePath)
            .resize(800, 800, { // Adjust size as needed
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 90 })
            .toFile(outputPath);

        // Add a small delay before deleting the source file
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            // Try to delete the source file
            await fs.unlink(sourcePath);
        } catch (deleteError) {
            console.log('Warning: Could not delete source file:', deleteError.message);
            // Continue even if delete fails
        }

        // Return the relative path for storage in database
        return '/uploads/categories/' + filename;
    } catch (error) {
        console.error('Image processing error:', error);
        throw error;
    }
};

module.exports = processImage;
