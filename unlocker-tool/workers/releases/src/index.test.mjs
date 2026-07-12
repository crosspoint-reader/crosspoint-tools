import assert from "node:assert/strict";
import {
  manifestKeyForLatestAlias,
  targetKeyForLatestAlias,
} from "./index.ts";

const manifest = {
  version: "0.2.99",
  platforms: {
    "linux-aarch64": {
      signature: "sig",
      url: "https://unlocker-releases.crosspointreader.com/v0.2.26/XteinkUnlocker_0.2.26_linux-aarch64.AppImage",
    },
    "linux-x86_64": {
      signature: "sig",
      url: "https://unlocker-releases.crosspointreader.com/v0.2.30/XteinkUnlocker_0.2.30_linux-x86_64.AppImage",
    },
  },
};

assert.equal(
  manifestKeyForLatestAlias("unlocker-latest-arm64.deb"),
  "latest-linux-aarch64.json",
);
assert.equal(
  targetKeyForLatestAlias("unlocker-latest-arm64.deb", manifest),
  "v0.2.26/XteinkUnlocker_0.2.26_linux-aarch64.deb",
);

assert.equal(
  manifestKeyForLatestAlias("unlocker-latest.deb"),
  "latest-linux-x86_64.json",
);
assert.equal(
  targetKeyForLatestAlias("unlocker-latest.deb", manifest),
  "v0.2.30/XteinkUnlocker_0.2.30_linux-x86_64.deb",
);

assert.equal(manifestKeyForLatestAlias("firmware.bin"), null);
assert.equal(targetKeyForLatestAlias("firmware.bin", manifest), null);
