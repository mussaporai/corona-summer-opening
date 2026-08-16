const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

let client = null;
function r2() {
  if (!client) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("Cloudflare R2 não configurado (variáveis de ambiente ausentes)");
    }
    client = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  return client;
}

function bucket() {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error("R2_BUCKET não configurado");
  return b;
}

async function getPresignedPutUrl(key, contentType) {
  const cmd = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
  return getSignedUrl(r2(), cmd, { expiresIn: 300 });
}

async function getPresignedGetUrl(key) {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(r2(), cmd, { expiresIn: 300 });
}

async function deleteObject(key) {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

module.exports = { getPresignedPutUrl, getPresignedGetUrl, deleteObject };
