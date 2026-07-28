import Church from "../models/Church.js";

// REGISTER A NEW CHURCH
export const registerChurch = async (req, res) => {
  const { name, location } = req.body;
  try {
    const newChurch = new Church({ name, location });
    await newChurch.save();
    res.status(201).json({ success: true, church: newChurch });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to register church: " + error.message });
  }
};

// GET PUBLIC PROFILE BRANDING
export const getPublicChurchProfile = async (req, res) => {
  try {
    const { churchId } = req.query;

    if (!churchId) {
      return res.status(400).json({
        success: false,
        message: "Church identifier parameter is missing.",
      });
    }

    const church = await Church.findById(churchId).select("name");

    if (!church) {
      return res
        .status(404)
        .json({ success: false, message: "Church organization not found." });
    }

    return res.status(200).json({
      success: true,
      churchName: church.name,
    });
  } catch (error) {
    console.error("Error fetching public church profile:", error);
    return res.status(500).json({
      success: false,
      message: "Core server error fetching branding profiles.",
    });
  }
};
