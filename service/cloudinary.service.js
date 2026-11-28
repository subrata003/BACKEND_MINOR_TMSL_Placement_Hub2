const { cloudinary } = require("../config/cloudinary");
const fs = require("fs");

const uploadOnCloudinary = async (
    localFilePath,
    resourceType = "raw"
) => {
    try {
        if (!localFilePath) {
            console.log("Local file path is missing");
            return null;
        }

        const response = await cloudinary.uploader.upload(
            localFilePath,
            {
                resource_type: resourceType,
                folder: "placementHub/resumeandprofile"
            }
        );


        console.log("UPLOAD RESPONSE:", {
            public_id: response.public_id,
            asset_id: response.asset_id,
            asset_folder: response.asset_folder,
            resource_type: response.resource_type,
            type: response.type,
            secure_url: response.secure_url
        });

        // Delete temporary local file after successful upload
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
            console.log("Temporary file deleted:", localFilePath);
        }

        return response;

    } catch (error) {
        console.error(
            "Cloudinary upload failed:",
            error.message
        );

        // Remove temporary local file if it exists
        if (localFilePath && fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }

        return null;
    }
};


const deleteFromeCloudinary = async (
    publicId,
    resourceType = "raw"
) => {
    try {
        if (!publicId) {
            return {
                success: false,
                message: "Cloudinary public ID is required"
            };
        }

        const response = await cloudinary.uploader.destroy(
            publicId,
            {
                resource_type: resourceType
            }
        );

        console.log("Cloudinary delete result:", response);

        if (
            response.result === "ok" ||
            response.result === "not found"
        ) {
            return {
                success: true,
                message:
                    response.result === "ok"
                        ? "PDF deleted successfully"
                        : "PDF was already deleted",
                result: response
            };
        }

        return {
            success: false,
            message: "Cloudinary did not delete the file",
            result: response
        };

    } catch (error) {
        console.error(
            "Cloudinary delete failed:",
            error
        );

        return {
            success: false,
            message: "Failed to delete PDF file from Cloudinary",
            error: error?.message || String(error)
        };
    }
};



module.exports = {
    uploadOnCloudinary,
    deleteFromeCloudinary
};