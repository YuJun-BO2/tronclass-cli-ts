import { CookieJar } from "tough-cookie";
const jar = new CookieJar();
jar.setCookieSync("a=b; Domain=example.com", "http://example.com");
const json = jar.toJSON();
console.log(JSON.stringify(json));
const jar2 = CookieJar.fromJSON(json);
console.log(jar2.getCookieStringSync("http://example.com"));
