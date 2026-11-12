import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  useTreeviewController,
  type TreeviewController,
} from "../useTreeviewController";

describe("Treeview Vue arrow navigation", () => {
  it("forwards APG ArrowLeft and ArrowRight actions without coupling focus to multi-selection", () => {
    const scope = effectScope();
    let controller!: TreeviewController<string>;
    scope.run(() => {
      controller = useTreeviewController<string>({
        selectionMode: "multiple",
        nodes: [
          { value: "root", parent: null },
          { value: "branch", parent: "root" },
          { value: "leaf", parent: "branch" },
        ],
        defaultExpanded: ["root", "branch"],
        defaultActive: "leaf",
        defaultSelected: "leaf",
      });
    });
    controller.requestSelect("branch", { ctrlKey: true });
    controller.requestFocus("leaf");
    const selectedValues = controller.state.value.selectedValues;
    const anchorValue = controller.state.value.anchorValue;
    const subscription = vi.fn();
    const subscriptionHandle = controller.core.subscribe(subscription);
    subscription.mockClear();

    expect(controller.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(controller.state.value.focusedValue).toBe("branch");
    expect(controller.isExpanded("root")).toBe(true);
    expect(subscription).toHaveBeenCalledTimes(1);
    expect(controller.state.value.selectedValues).toEqual(selectedValues);
    expect(controller.state.value.anchorValue).toBe(anchorValue);

    subscription.mockClear();
    expect(controller.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(controller.state.value.focusedValue).toBe("branch");
    expect(controller.isExpanded("branch")).toBe(false);
    expect(subscription).toHaveBeenCalledTimes(1);
    expect(controller.state.value.selectedValues).toEqual(selectedValues);
    expect(controller.state.value.anchorValue).toBe(anchorValue);

    subscription.mockClear();
    expect(controller.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(controller.state.value.focusedValue).toBe("root");
    expect(controller.isExpanded("root")).toBe(true);
    expect(subscription).toHaveBeenCalledTimes(1);

    subscription.mockClear();
    expect(controller.requestArrowRight()).toEqual({ ok: true, changed: true });
    expect(controller.state.value.focusedValue).toBe("branch");
    expect(controller.isExpanded("root")).toBe(true);
    expect(subscription).toHaveBeenCalledTimes(1);

    subscription.mockClear();
    expect(controller.requestArrowRight()).toEqual({ ok: true, changed: true });
    expect(controller.state.value.focusedValue).toBe("branch");
    expect(controller.isExpanded("branch")).toBe(true);
    expect(subscription).toHaveBeenCalledTimes(1);

    subscription.mockClear();
    expect(controller.requestArrowRight()).toEqual({ ok: true, changed: true });
    expect(controller.state.value.focusedValue).toBe("leaf");
    expect(subscription).toHaveBeenCalledTimes(1);
    expect(controller.state.value.selectedValues).toEqual(selectedValues);
    expect(controller.state.value.anchorValue).toBe(anchorValue);

    subscriptionHandle.unsubscribe();
    scope.stop();
  });
});
