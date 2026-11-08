import * as fs from "fs/promises"

/**
 * @typedef ModMetadata
 * @property {string} name
 * @property {string | undefined} full_name
 * @property {string} description
 * @property {string} state "released" | "unreleased" | "prototype" | "outdated (version)"
 * @property {string} icon "none" | "geode:mod-id" | "asset"
 */

/**
 * @param {string} modID
 * @returns {Promise<{info: ModMetadata, markdown: string} | null>}
 */
async function readModData(modID) {
    let file = Bun.file(`mods/${modID}.md`);
    if (!await file.exists()) {
        return null;
    }

    let text = await file.text();
    let [ infoString, markdown ] = text.split("-->", 2);
    if (!infoString || !markdown) throw new Error("unreachable");

    /** @type {ModMetadata} */
    let info = JSON.parse(infoString.replace("<!--", ""));

    return { info, markdown };
}

let server = Bun.serve({
    routes: {
        "/": async req => {
            let rewriter = new HTMLRewriter()
                .on("div#content", {
                    element: async content => {
                        for (let file of await fs.readdir("mods/")) {
                            let modID = file.replace(".md", "");
                            let data = await readModData(modID);
                            if (!data) continue;

                            content.append(`
                                <a class="mod" href="/${modID}">
                                    <h2 class="mod-title">
                                        <img class="mod-icon" src="${(() => {
                                            if (data.info.icon == "none") {
                                                return "/assets/mods/unknown.png";
                                            }

                                            if (data.info.icon == "asset") {
                                                return `/assets/mods/${modID}.png`;
                                            }

                                            if (data.info.icon.startsWith("geode:")) {
                                                return `https://api.geode-sdk.org/v1/mods/${data.info.icon.replace("geode:", "")}/logo`
                                            }

                                            return `Unknown mod icon type ${data.info.icon}`;
                                        })()}">
                                        ${data.info.name}
                                    </h2>
                                    <p class="mod-desc">${data.info.description}</p>
                                    <div class="mod-state mod-state-${data.info.state.split(" ")[0]}">${data.info.state[0]?.toUpperCase() + data.info.state.slice(1)}</div>
                                    ${await (async () => {
                                        if (!await Bun.file(`public/assets/mods/${modID}-preview.png`).exists()) {
                                            return "";
                                        }

                                        return `
                                            <div class="mod-preview-wrap">
                                                <img class="mod-preview" src="/assets/mods/${modID}-preview.png" />
                                            </div>
                                        `;
                                    })()}
                                </a>
                            `, { html: true });
                        }
                    }
                });

            return rewriter.transform(new Response(Bun.file("public/index.html")));
        },

        "/:mod": async req => {
            let data = await readModData(req.params.mod);
            if (!data) {
                return new Response(`Mod ${req.params.mod} was not found!`, { status: 404 });
            }

            let rewriter = new HTMLRewriter()
                .on("title", {
                    text: text => {
                        text.replace(text.text.replace("{{MOD_NAME}}", data.info.name))
                    }
                })
                .on("div#content", {
                    element: content => {
                        content.replace(Bun.markdown.html(data.markdown), { html: true });
                    }
                });

            return rewriter.transform(new Response(Bun.file("public/mod.html")));
        },

        "/assets/*": async req => {
            let file = Bun.file(`public/assets/${new URL(req.url).pathname.replace("/assets/", "")}`);
            if (!await file.exists()) {
                return new Response("404 Not Found", { status: 404 });
            }

            return new Response(file, { headers: { "Content-Type": file.type } });
        }
    },

    port: process.env.PORT,
    development: process.env.DEVELOPMENT == "true"
});

console.log(`Hosting mod archive at port ${server.port}`);
