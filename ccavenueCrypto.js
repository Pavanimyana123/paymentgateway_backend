const crypto = require("crypto");

exports.encrypt = function (plainText, workingKey) {
  const md5 = crypto.createHash("md5").update(workingKey).digest();
  const key = Buffer.alloc(16);
  md5.copy(key, 0, 0, 16);
  const iv = Buffer.from([...Array(16).keys()]);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(true);
  let encoded = cipher.update(plainText, "utf8", "hex");
  encoded += cipher.final("hex");
  return encoded;
};

exports.decrypt = function (encText, workingKey) {
  const md5 = crypto.createHash("md5").update(workingKey).digest();
  const key = Buffer.alloc(16);
  md5.copy(key, 0, 0, 16);
  const iv = Buffer.from([...Array(16).keys()]);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(true);
  let decoded = decipher.update(encText, "hex", "utf8");
  decoded += decipher.final("utf8");
  return decoded;
};
