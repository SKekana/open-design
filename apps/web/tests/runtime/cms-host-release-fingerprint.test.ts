import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CMS_HOST_RELEASE_INPUTS,
	cmsHostReleaseFingerprint,
} from "../../next.config";

const workspaceRoot = resolve(process.cwd(), "../..");
const readCmsHostReleaseInput = (
	file: (typeof CMS_HOST_RELEASE_INPUTS)[number],
) => readFileSync(resolve(workspaceRoot, file));

describe("CMS host release fingerprint", () => {
	it("loads packaged config when shipped sources are outside the workspace layout", () => {
		const fixture = mkdtempSync(resolve(tmpdir(), "od-packaged-config-"));
		try {
			const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const configPath = resolve(process.argv[2], 'node_modules/@open-design/web/next.config.mjs');
const webRoot = dirname(configPath);
mkdirSync(resolve(webRoot, 'src/components'), { recursive: true });
writeFileSync(resolve(webRoot, 'src/components/touchpoint-component.ts'), '');
writeFileSync(configPath, stripTypeScriptTypes(readFileSync(process.argv[1], 'utf8'), { mode: 'transform' }));
const { default: config } = await import(pathToFileURL(configPath).href);
console.log(JSON.stringify(config.env));
`, resolve(process.cwd(), "next.config.ts"), fixture], {
				encoding: "utf8",
				env: { ...process.env, NODE_ENV: "production", OD_WEB_OUTPUT_MODE: "server", OD_WORKSPACE_ROOT: "" },
			});
			expect(JSON.parse(output)).not.toHaveProperty("NEXT_PUBLIC_CMS_HOST_RELEASE");
		} finally {
			rmSync(fixture, { recursive: true, force: true });
		}
	});

	it("is stable for identical host sources", () => {
		expect(cmsHostReleaseFingerprint(readCmsHostReleaseInput)).toBe(
			cmsHostReleaseFingerprint(readCmsHostReleaseInput),
		);
	});

	it.each(CMS_HOST_RELEASE_INPUTS)(
		"changes when host input %s changes",
		(changedFile) => {
			const baseline = cmsHostReleaseFingerprint(readCmsHostReleaseInput);
			const changedHost = cmsHostReleaseFingerprint((file) =>
				file === changedFile
					? Buffer.concat([
							readCmsHostReleaseInput(file),
							Buffer.from("\n/* changed */"),
						])
					: readCmsHostReleaseInput(file),
			);

			expect(changedHost).not.toBe(baseline);
		},
	);
});
