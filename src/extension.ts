import * as path from "path";
import * as vscode from "vscode";
import { getUserConfiguration, loadGlobals, Log, LOGGER } from "./globals";
import { ManimSideview } from "./sideview";
import { PythonExtension } from "@vscode/python-extension";

export async function activate(context: vscode.ExtensionContext) {
  Log.info("Activating extension.");
  await loadGlobals(context);

  const pythonApi: PythonExtension = await PythonExtension.api();
  const sideview = new ManimSideview(context, pythonApi);

  context.subscriptions.push(
    vscode.commands.registerCommand("manim-lens.run", (...args) =>
      sideview.cmdRun(...args),
    ),
    vscode.commands.registerCommand("manim-lens.removeAllJobs", () =>
      sideview.cmdRemoveAllJobs(),
    ),
    vscode.commands.registerCommand("manim-lens.stop", () =>
      sideview.cmdStop(),
    ),
    vscode.commands.registerCommand("manim-lens.renderNewScene", (...args) =>
      sideview.cmdRenderNewScene(...args),
    ),
    vscode.commands.registerCommand("manim-lens.removeCurrentJob", () =>
      sideview.cmdRemoveJob(),
    ),
    vscode.commands.registerCommand("manim-lens.updateDefaultManimConfig", () =>
      sideview.cmdUpdateDefaultManimConfig(),
    ),
    vscode.commands.registerCommand("manim-lens.showOutputChannel", () =>
      LOGGER.show(true),
    ),
    vscode.commands.registerCommand("manim-lens.showExtensionManimConfig", () =>
      vscode.workspace
        .openTextDocument(
          path.join(context.extensionPath, "./assets/local/manim.cfg.json"),
        )
        .then((doc) => vscode.window.showTextDocument(doc)),
    ),
  );

  vscode.workspace.onDidSaveTextDocument(
    (e) => {
      if (
        getUserConfiguration<boolean>("runOnSave") &&
        e.fileName.endsWith(".py")
      ) {
        vscode.commands.executeCommand("manim-lens.run", e.fileName, true);
      }
    },
    null,
    context.subscriptions,
  );

  Log.info("Activated extension.");
}
