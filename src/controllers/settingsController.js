import mongoose from "mongoose";
import ShopSettings from "../models/ShopSettings.js";
import Product from "../models/Product.js";
import Collection from "../models/Collection.js";
import { uploadBuffer, destroyAsset } from "../services/cloudinaryService.js";
import { sendToAll } from "../services/notificationService.js";

const allowedFields = [
  "shopName", "logo", "description", "comingSoon", "address", "phone", "whatsapp",
  "googleMapsUrl", "openingHours", "socialLinks", "heroContent",
  "branding", "homepage", "contact", "business", "policies"
];

function parseJson(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { throw new Error(`Invalid ${field} data.`); }
}

function cleanIds(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((id) => mongoose.isValidObjectId(id)).map(String);
}

async function uploadImage(file, folder) {
  if (!file) return null;
  if (!file.mimetype?.startsWith("image/")) throw new Error("Only image files are allowed.");
  const result = await uploadBuffer(file.buffer, { folder, resourceType: "image" });
  return { publicId: result.public_id, secureUrl: result.secure_url };
}

async function destroyImage(image) {
  if (image?.publicId) await destroyAsset(image.publicId, "image");
}

function mergeSettings(settings) {
  const obj = settings?.toObject ? settings.toObject() : settings || {};
  return {
    ...obj,
    shopName: typeof obj.shopName === "string" ? obj.shopName : "",
    comingSoon: { enabled: Boolean(obj.comingSoon?.enabled), title: obj.comingSoon?.title || "Coming Soon", message: obj.comingSoon?.message || "We are getting ready. Subscribe to notifications and we will let you know when we launch." },
    branding: {
      ...(obj.branding || {}),
      logo: obj.branding?.logo?.secureUrl ? obj.branding.logo : (obj.logo || {})
    },
    contact: {
      ...(obj.contact || {}),
      phone: obj.contact?.phone || obj.phone || "",
      whatsapp: obj.contact?.whatsapp || obj.whatsapp || "",
      address: obj.contact?.address || obj.address || "",
      googleMapsUrl: obj.contact?.googleMapsUrl || obj.googleMapsUrl || "",
      socialLinks: obj.contact?.socialLinks || obj.socialLinks || {}
    },
    business: {
      ...(obj.business || {}),
      openingHours: obj.business?.openingHours || obj.openingHours || ""
    },
    homepage: {
      ...(obj.homepage || {}),
      hero: {
        ...(obj.homepage?.hero || {}),
        title: obj.homepage?.hero?.title || obj.heroContent?.title || "",
        description: obj.homepage?.hero?.description || obj.heroContent?.description || "",
        image: obj.homepage?.hero?.image || obj.heroContent?.image || {}
      }
    }
  };
}

export async function get(req, res) {
  let settings = await ShopSettings.findOne({ tenantId: req.tenant._id }).lean();
  if (!settings) settings = await ShopSettings.create({ tenantId: req.tenant._id });
  res.json(mergeSettings(settings));
}

export async function update(req, res) {
  const tenantId = req.tenant._id;
  const current = await ShopSettings.findOne({ tenantId });

  const update = {};
  try {
    const jsonFields = new Set(["logo", "socialLinks", "heroContent", "branding", "homepage", "contact", "business", "policies", "comingSoon"]);
    for (const key of allowedFields) {
      if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
      update[key] = jsonFields.has(key) ? parseJson(req.body[key], key) : req.body[key];
    }

    for (const key of ["branding", "homepage", "contact", "business", "policies", "comingSoon"]) {
      if (update[key] && typeof update[key] !== "object") return res.status(400).json({ message: `Invalid ${key} data.` });
    }

    const comingSoon = { ...(current?.comingSoon?.toObject?.() || current?.comingSoon || {}), ...(update.comingSoon || {}) };
    if (comingSoon.enabled !== undefined) comingSoon.enabled = Boolean(comingSoon.enabled);
    if (comingSoon.title !== undefined) comingSoon.title = String(comingSoon.title).slice(0, 160);
    if (comingSoon.message !== undefined) comingSoon.message = String(comingSoon.message).slice(0, 1000);

    const branding = { ...(current?.branding?.toObject?.() || current?.branding || {}), ...(update.branding || {}) };
    const contact = { ...(current?.contact?.toObject?.() || current?.contact || {}), ...(update.contact || {}) };
    const business = { ...(current?.business?.toObject?.() || current?.business || {}), ...(update.business || {}) };
    const policies = { ...(current?.policies?.toObject?.() || current?.policies || {}), ...(update.policies || {}) };
    const homepage = { ...(current?.homepage?.toObject?.() || current?.homepage || {}), ...(update.homepage || {}) };
    homepage.hero = { ...(current?.homepage?.hero?.toObject?.() || current?.homepage?.hero || {}), ...(update.homepage?.hero || {}) };

    // Keep legacy fields synchronized with the new configuration.
    if (update.shopName !== undefined) {
      if (typeof update.shopName === "object") return res.status(400).json({ message: "Store name must be plain text." });
      update.shopName = String(update.shopName).trim().slice(0, 160);
    }
    if (update.description !== undefined) update.description = String(update.description).slice(0, 5000);
    if (update.address !== undefined) update.address = String(update.address).slice(0, 1000);
    if (update.phone !== undefined) update.phone = String(update.phone).slice(0, 80);
    if (update.whatsapp !== undefined) update.whatsapp = String(update.whatsapp).slice(0, 80);
    if (update.googleMapsUrl !== undefined) update.googleMapsUrl = String(update.googleMapsUrl).slice(0, 1000);
    if (update.openingHours !== undefined) update.openingHours = String(update.openingHours).slice(0, 1000);

    if (update.contact) {
      contact.phone = update.contact.phone ?? contact.phone ?? "";
      contact.whatsapp = update.contact.whatsapp ?? contact.whatsapp ?? "";
      contact.address = update.contact.address ?? contact.address ?? "";
      contact.googleMapsUrl = update.contact.googleMapsUrl ?? contact.googleMapsUrl ?? "";
      if (update.contact.email !== undefined) contact.email = update.contact.email;
      if (update.contact.socialLinks !== undefined) contact.socialLinks = update.contact.socialLinks;
      update.phone = contact.phone; update.whatsapp = contact.whatsapp;
      update.address = contact.address; update.googleMapsUrl = contact.googleMapsUrl;
      update.socialLinks = contact.socialLinks;
    }
    if (update.business?.openingHours !== undefined) {
      business.openingHours = update.business.openingHours;
      update.openingHours = business.openingHours;
    }
    if (update.socialLinks !== undefined) contact.socialLinks = update.socialLinks;

    if (update.heroContent) {
      const legacyHero = { ...(current?.heroContent?.toObject?.() || current?.heroContent || {}), ...update.heroContent };
      update.heroContent = legacyHero;
      homepage.hero = { ...homepage.hero, ...legacyHero };
    }

    const folder = `dress-saas/${tenantId}/shop`;

    if (req.files?.logoImage?.[0]) {
      const image = await uploadImage(req.files.logoImage[0], folder);
      await destroyImage(current?.branding?.logo || current?.logo);
      branding.logo = image;
      update.logo = image;
    } else if (req.body.removeLogo === "true") {
      await destroyImage(current?.branding?.logo || current?.logo);
      branding.logo = {};
      update.logo = {};
    }

    if (req.files?.faviconImage?.[0]) {
      const image = await uploadImage(req.files.faviconImage[0], folder);
      await destroyImage(current?.branding?.favicon);
      branding.favicon = image;
    } else if (req.body.removeFavicon === "true") {
      await destroyImage(current?.branding?.favicon);
      branding.favicon = {};
    }

    if (req.files?.heroImage?.[0]) {
      const image = await uploadImage(req.files.heroImage[0], folder);
      await destroyImage(current?.homepage?.hero?.image || current?.heroContent?.image);
      homepage.hero.image = image;
      update.heroContent = { ...(update.heroContent || current?.heroContent?.toObject?.() || current?.heroContent || {}), image };
    } else if (req.body.removeHeroImage === "true") {
      await destroyImage(current?.homepage?.hero?.image || current?.heroContent?.image);
      homepage.hero.image = {};
      update.heroContent = { ...(update.heroContent || current?.heroContent?.toObject?.() || current?.heroContent || {}) };
      delete update.heroContent.image;
    }

    if (req.files?.bannerImages?.length) {
      const uploaded = [];
      for (const file of req.files.bannerImages.slice(0, 10)) {
        uploaded.push({ image: await uploadImage(file, `${folder}/banners`), title: "", description: "", link: "", active: true });
      }
      homepage.banners = [...(homepage.banners || []), ...uploaded];
    }

    if (update.homepage?.featuredCollections !== undefined || homepage.featuredCollections !== undefined) {
      const ids = cleanIds(homepage.featuredCollections);
      homepage.featuredCollections = await Collection.find({ tenantId, _id: { $in: ids }, isActive: true }).distinct("_id");
    }
    if (update.homepage?.featuredProducts !== undefined || homepage.featuredProducts !== undefined) {
      const ids = cleanIds(homepage.featuredProducts);
      homepage.featuredProducts = await Product.find({ tenantId, _id: { $in: ids }, isAvailable: true }).distinct("_id");
    }

    // Destroy banner media removed from the saved configuration.
    if (Array.isArray(update.homepage?.banners) && current?.homepage?.banners) {
      const kept = new Set(update.homepage.banners.map((b) => String(b?._id || b?.id || "")));
      for (const oldBanner of current.homepage.banners) {
        if (oldBanner?.image?.publicId && !kept.has(String(oldBanner._id))) await destroyImage(oldBanner.image);
      }
    }

    branding.logo = branding.logo || update.logo || current?.logo || {};
    homepage.hero = homepage.hero || {};
    contact.socialLinks = contact.socialLinks || update.socialLinks || {};
    update.comingSoon = comingSoon;
    update.branding = branding;
    update.homepage = homepage;
    update.contact = contact;
    update.business = business;
    update.policies = policies;
    if (branding.logo?.secureUrl) update.logo = branding.logo;

    const wasComingSoon = Boolean(current?.comingSoon?.enabled);
    const willBeComingSoon = Boolean(update.comingSoon?.enabled);

    const settings = await ShopSettings.findOneAndUpdate(
      { tenantId },
      { $set: update, $setOnInsert: { tenantId } },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    if (wasComingSoon && !willBeComingSoon) {
      sendToAll({
        title: settings.shopName || "We are live!",
        body: "We are now open. Come visit the store and explore our latest collection.",
        image: settings.branding?.logo?.secureUrl || settings.logo?.secureUrl || undefined,
        data: { url: `/shop/${req.tenant.slug}` }
      }, tenantId).catch(() => {});
    }

    res.json(mergeSettings(settings));
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to update storefront settings." });
  }
}
