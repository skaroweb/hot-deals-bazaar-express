const express = require("express");
const axios = require("axios");
const cors = require("cors");
const cheerio = require("cheerio");
const cron = require("node-cron");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const app = express();

// Serve static files from the 'public' directory
app.use("/uploads", express.static(path.join(__dirname + "/uploads")));

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

/****************** scrapeData from thuttu *************/

// Helper function to scrape data from India Free Stuff
async function scrapeData() {
  const url = `https://thuttu.com/`;
  try {
    const response = await axios.get(url);
    const html = response.data;
    const extractedData = [];

    const $ = cheerio.load(html);
    const selectedElem = ".deals-grid.deals.msyitem";

    $(selectedElem).each((index, element) => {
      const productDetails = {};

      productDetails.productImgLink = $(element)
        .find(".pimg a img")
        .attr("src");

      productDetails.productLink = $(element).find(".pimg a").attr("data-link");
      productDetails.title = $(element)
        .find(".post-title.pdetail a")
        .text()
        .trim();
      productDetails.discount = $(element).find(".per").text().trim();
      const imagePath = $(element).find(".pimg a .storename img").attr("src");
      const filenameWithExtension = path.basename(
        imagePath,
        path.extname(imagePath)
      );
      function capitalizeFirstLetter(str) {
        if (!str) {
          return str; // Return the input string if it's empty or null
        }
        return str.charAt(0).toUpperCase() + str.slice(1);
      }
      productDetails.platform = capitalizeFirstLetter(filenameWithExtension);
      const dealPrice = $(element).find(".dealprice.dprice").text().trim();
      const originalPrice = $(element).find(".mrpprice.oprice").text().trim();
      productDetails.dealPrice = dealPrice;
      productDetails.originalPrice = originalPrice;

      extractedData.push(productDetails);
    });

    return extractedData;
  } catch (error) {
    return [];
  }
}

/****************** scrapeData from thuttu *************/

/****************** scrapeData to add API /api/products *************/
// Initial load of deals
app.get("/api/products", async (req, res) => {
  try {
    const crypto = await scrapeData();

    const extractedData = await scrapeData();

    for (let i = extractedData.length - 1; i >= 0; i--) {
      const productData = extractedData[i];
      await postDataToAPIB(productData);
    }

    return res.status(200).json({
      result: crypto,
    });
  } catch (err) {
    return res.status(500).json({
      err: err.toString(),
    });
  }
});

/****************** scrapeData to add API /api/products *************/

// Post data to another API
async function postDataToAPIB(productData) {
  const apiBUrl = "https://hot-deals-bazaar-strapi.onrender.com/api/products"; // Replace with the actual API B URL

  try {
    /******************** check products already Exists  *************/

    const existingDataResponse = await axios.get(apiBUrl);

    const existingData = existingDataResponse.data.data;

    function cleanAndFormatString(str) {
      return str
        .trim()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();
    }

    const isDataAlreadyExists = existingData.some(
      (item) =>
        cleanAndFormatString(item.attributes.title) ===
        cleanAndFormatString(productData.title)
    );

    if (isDataAlreadyExists) {
      console.log("Data already exists. Not posting.");
      return false;
    }
    /******************** check products already Exists  *************/

    /******************** Download Image  *************/
    const imageFileName = path.basename(productData.productImgLink);
    const imagePath = path.join(__dirname, "/uploads", imageFileName);

    const imageResponse = await axios.get(productData.productImgLink, {
      responseType: "stream",
    });

    const writeStream = fs.createWriteStream(imagePath);
    imageResponse.data.pipe(writeStream);

    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    /******************** Download Image  ***************/

    /******************** Image Upload  *************/
    const formData = new FormData();
    formData.append("files", fs.createReadStream(imagePath), {
      filename: imageFileName,
    });
    formData.append("ref", "api::product.product");
    formData.append("field", "productimage");

    const strapiApiUrl = "https://hot-deals-bazaar-strapi.onrender.com";
    const uploadUrl = `${strapiApiUrl}/api/upload`;

    const uploadResponse = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    console.log("Image uploaded successfully to Strapi.");

    /******************** Image Upload  ***************/

    /******************** Data Posting  *************/
    const postData = {
      productLink: productData.productLink,
      title: productData.title,
      dealPrice: productData.dealPrice,
      originalPrice: productData.originalPrice,
      platform: productData.platform,
      discount: productData.discount,
      productimage: uploadResponse.data[0].id, // Use the uploaded image ID
    };

    // Post the data to your API B
    await axios.post(apiBUrl, postData);
    console.log("Data posted to API B.");

    /******************** Data Posting  ***************/
  } catch (error) {
    console.error("Error posting data to API B:", error.message);
  }
}

/****************** Schedule the cron job  ***************/

// Schedule the cron job to fetch and post data every 5 minutes

// cron.schedule("*/1 * * * *", async () => {
//   try {
//     console.log("Running cron job...");
//     const extractedData = await scrapeData();

//     for (let i = extractedData.length - 1; i >= 0; i--) {
//       const productData = extractedData[i];
//       await postDataToAPIB(productData);
//     }

//     console.log("Cron job completed.");
//   } catch (error) {
//     console.error("Cron job error:", error.message);
//   }
// });

/****************** Schedule the cron job  ***************/

const port = process.env.PORT || 8080;
app.listen(port, console.log(`Listening on port ${port}...`));
