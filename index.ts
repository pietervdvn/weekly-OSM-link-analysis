import * as https from "https";
import * as dom from "fake-dom"
import * as fs from "fs";

class Main {

    public static async main() {
        if (dom === undefined) {
            console.log("Fakedom not loaded")
        }
        const csvEntries: string[] = ["issue, twitter and nitter, en.osm.town, other mastodon"]
        const targetYear = (new Date()).getUTCFullYear()
        for (let year = 2020; year <= targetYear; year++) {
            for (let month = 1; month <= 12; month++) {
                console.log("Analyzing",year, month)
                if (year === targetYear && month > (new Date().getUTCMonth() + 1)) {
                    console.log("Stopping now")
                    break
                }
                let m = "" + month
                if (m.length == 1) {
                    m = "0" + m
                }
                const baseUrl = `https://weeklyosm.eu/archives/date/${year}/${m}`
                let r: { twitter: number, osmtown: number, mastodon: number } = {
                    twitter: 0,
                    osmtown: 0,
                    mastodon: 0
                }
                try {
                    const issue = await Main.analyse(baseUrl)
                    r = Main.sum(r, issue)
                } catch (e) {
                    console.log("SKipping ", baseUrl)
                }
                for (let i = 5; i >= 2; i--) {
                    try {

                        const issue = await Main.analyse(baseUrl + "/page/" + i)
                        r = Main.sum(r, issue)
                    } catch (e) {
                        console.log("SKipping ", baseUrl + "/page/" + i)
                    }
                }
                const entry = year + "-" + month + "," + r.twitter + "," + r.osmtown + "," + r.mastodon
                csvEntries.push(entry)

            }
        }
        fs.writeFileSync("entries.csv", csvEntries.join("\n"))
    }

    private static sum<X extends Record<string, number>>(a: X, b: X): X {
        const r: X = {
            ...a
        }
        for (const key in b) {
            // @ts-ignore
            a[key] = (a[key] ?? 0) + (b[key] ?? 0)
        }
        return a
    }

    private static async Download(url: string, headers?: any): Promise<{ content: string }> {
        const cache = "./cache/" + url.replace(/[./\\:?]/g, "_")
        if (fs.existsSync(cache)) {
            return {content: fs.readFileSync(cache, {encoding: "utf-8"})}
        }

        console.log("> Downloading", url)

        return new Promise((resolve, reject) => {
            try {
                headers = headers ?? {}
                headers.accept = "application/json"
                const urlObj = new URL(url)
                https.get(
                    {
                        host: urlObj.host,
                        path: urlObj.pathname + urlObj.search,

                        port: urlObj.port,
                        headers: headers,
                    },
                    (res) => {
                        const parts: string[] = []
                        res.setEncoding("utf8")
                        res.on("data", function (chunk) {
                            // @ts-ignore
                            parts.push(chunk)
                        })

                        res.addListener("end", function () {
                            fs.writeFileSync(cache, parts.join(""))
                            resolve({content: parts.join("")})
                        })
                    }
                )
            } catch (e) {
                reject(e)
            }
        })
    }

    private static async analyse(url: string): Promise<{ twitter: number, osmtown: number, mastodon: number }> {
        const data = await this.Download(url)
        const doc = document.createElement("html")
        doc.innerHTML = data.content
        const article = doc.getElementsByTagName("article")[0]
        const asides = Array.from(article.getElementsByTagName("aside"))
        for (const aside of asides) {
            aside.parentElement.removeChild(aside)
        }

        const links = Array.from(article.getElementsByTagName("a"))
        const hosts: Record<string, number> = {}
        for (const link of links) {
            const url = new URL(link.href)
            hosts[url.host] = 1 + (hosts[url.host] ?? 0)
        }

        const result = {
            twitter: (hosts["twitter.com"] ?? 0) + (hosts["nitter.net"] ?? 0),
            osmtown: hosts["en.osm.town"] ?? 0,
            mastodon: 0
        }

        for (let host in hosts) {
            const count = hosts[host]
            host = host.toLowerCase()
            if (host.endsWith("translate.goog")) {
                continue
            }
            if (host.indexOf('masto') >= 0 || host.indexOf('mapstodon') >= 0 || host.endsWith(".social") || host.endsWith(".town") || host.endsWith("botsin.space")) {
                console.log(host)
                result.mastodon += count
            }
        }

        return result

    }
}

Main.main().then(_ => console.log("All done"))
