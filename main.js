import * as fs from "fs/promises";

/**
 * @typedef ModMetadata
 * @property {string} name
 * @property {string | undefined} full_name
 * @property {string} description
 * @property {string} state "released" | "unreleased" | "prototype" | "outdated (version)"
 * @property {string} date
 * @property {string} icon "none" | "geode:mod-id" | "asset"
 * @property {string} preview "none" | "gh:undefined06855/repo-name/index" | "asset"
 */

/**
 * @typedef MarkdownData
 * @property {string} id
 * @property {ModMetadata} info
 * @property {string} markdown
 */

/**
 * @param {string} id
 * @returns {Promise<MarkdownData | null>}
 */
async function readModData(id) {
    let file = Bun.file(`mods/${id}.md`);
    if (!(await file.exists())) {
        return null;
    }

    let text = await file.text();
    let [infoString, markdown] = text.split("-->", 2);
    if (!infoString || !markdown) throw new Error("unreachable");

    /** @type {ModMetadata} */
    let info = JSON.parse(infoString.replace("<!--", ""));

    return { info, markdown, id };
}

/**
 * @param {Bun.BunRequest} req
 * @param {string} date
 */
function formatDate(req, date) {
    let temporal = Temporal.PlainDate.from(date);

    // fallback to canada which is yyyy-mm-dd
    let localeString = req.headers.get("Accept-Language")?.split(",")[0]?.split(";")[0]?.trim() ?? "en-CA";
    let locale = Intl.getCanonicalLocales(localeString)[0] ?? "en-CA";
    let parts = new Intl.DateTimeFormat(locale).formatToParts(temporal);

    return parts.map(({ type, value }) => value).join("");
}

let server = Bun.serve({
    routes: {
        "/": async req => {
            let rewriter = new HTMLRewriter().on("div#content", {
                element: async content => {
                    /** @type {Array<MarkdownData>} */
                    let mods = [];
                    for (let file of await fs.readdir("mods/")) {
                        let modID = file.replace(".md", "");
                        let data = await readModData(modID);
                        if (!data) continue;

                        mods.push(data);
                    }

                    mods.sort((a, b) =>
                        Temporal.PlainDate.from(a.info.date).since(Temporal.PlainDate.from(b.info.date)).total("days"),
                    );
                    mods.reverse();

                    for (let data of mods) {
                        let htmlString = `
                                <a class="mod" href="/${data.id}">
                                    <h2 class="mod-title">
                                        <img class="mod-icon" src="${(() => {
                                            if (data.info.icon == "none") {
                                                return "/assets/mods/unknown.png";
                                            }

                                            if (data.info.icon == "asset") {
                                                return `/assets/mods/${data.id}.png`;
                                            }

                                            if (data.info.icon.startsWith("geode:")) {
                                                let nonprefix = data.info.icon.replace("geode:", "");
                                                return `https://api.geode-sdk.org/v1/mods/${nonprefix}/logo`;
                                            }

                                            return `Unknown mod icon type ${data.info.icon}`;
                                        })()}" />
                                        <span>${data.info.name}</span>
                                    </h2>
                                    <p class="mod-desc">${data.info.description}</p>
                                    <div class="mod-preview-wrap">
                                        <img class="mod-preview" src="${await (async () => {
                                            if (data.info.preview == "none") {
                                                return "/assets/mods/no-preview.png";
                                            }

                                            if (data.info.preview == "asset") {
                                                return `/assets/mods/${data.id}-preview.png`;
                                            }

                                            if (data.info.preview.startsWith("gh:")) {
                                                let nonprefix = data.info.preview.replace("gh:", "");
                                                let [username, repoName, index] = nonprefix.split("/", 3);
                                                return `https://raw.githubusercontent.com/${username}/${repoName}/refs/heads/main/previews/preview-${index}.png`;
                                            }

                                            return `Unknown mod preview type ${data.info.preview}`;
                                        })()}" />
                                    </div>

                                    <small class="mod-state mod-state-${data.info.state.split(" ")[0]}">${data.info.state[0]?.toUpperCase() + data.info.state.slice(1)}</small>
                                    <small class="mod-date">${formatDate(req, data.info.date)}</small>
                                </a>
                            `;

                        content.append(htmlString, { html: true });
                    }
                },
            });

            return rewriter.transform(new Response(Bun.file("public/index.html"), { headers: { "Content-Type": "text/html" } }));
        },

        "/:mod": async req => {
            let data = await readModData(req.params.mod);
            if (!data) {
                return new Response(`Mod ${req.params.mod} was not found!`, { status: 404 });
            }

            let rewriter = new HTMLRewriter()
                .on("title", {
                    text: text => {
                        text.replace(text.text.replace("{{MOD_NAME}}", data.info.name));
                    },
                })
                .on("link", {
                    element: link => {
                        let content = link.getAttribute("content");
                        if (!content) return;

                        link.setAttribute(
                            "content",
                            content
                                .replace("{{MOD_DESCRIPTION}}", data.info.description)
                                .replace("{{MOD_NAME}}", data.info.name)
                                .replace("{{MOD_ID}}", req.params.mod),
                        );
                    },
                })
                .on("div#content", {
                    element: content => {
                        content.replace(Bun.markdown.html(data.markdown, { headings: true }), { html: true });
                    },
                });

            return rewriter.transform(new Response(Bun.file("public/mod.html"), { headers: { "Content-Type": "text/html" } }));
        },

        "/assets/*": async req => {
            let file = Bun.file(`public/assets/${new URL(req.url).pathname.replace("/assets/", "")}`);
            if (!(await file.exists())) {
                return new Response("404 Not Found", { status: 404 });
            }

            return new Response(file, { headers: { "Content-Type": file.type } });
        },
    },

    port: process.env.PORT,
    development: process.env.DEVELOPMENT == "true",
});

console.log(`Hosting mod archive at port ${server.port}`);
