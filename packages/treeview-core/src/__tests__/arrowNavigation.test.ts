import { describe, expect, it, vi } from "vitest";
import { TreeviewCore } from "../TreeviewCore";

describe("TreeviewCore arrow navigation", () => {
  it("follows Tree View ArrowLeft semantics through nested nodes without changing multi-selection", () => {
    const core = new TreeviewCore<string>({
      selectionMode: "multiple",
      nodes: [
        { value: "substation", parent: null },
        { value: "bay", parent: "substation" },
        { value: "sgt1", parent: "bay" },
        { value: "fmp", parent: "sgt1" },
        { value: "ied", parent: "fmp" },
      ],
      defaultExpanded: ["substation", "bay", "sgt1", "fmp"],
      defaultActive: "ied",
      defaultSelected: "ied",
    });
    core.requestSelect("fmp", { ctrlKey: true });
    core.requestFocus("ied");
    const selectedValues = core.getSnapshot().selectedValues;
    const anchorValue = core.getSnapshot().anchorValue;
    const subscriber = vi.fn();
    core.subscribe(subscriber);
    subscriber.mockClear();

    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("fmp");
    expect(core.isExpanded("fmp")).toBe(true);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(core.getSnapshot().selectedValues).toEqual(selectedValues);
    expect(core.getSnapshot().anchorValue).toBe(anchorValue);

    subscriber.mockClear();
    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("fmp");
    expect(core.isExpanded("fmp")).toBe(false);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(core.getSnapshot().selectedValues).toEqual(selectedValues);
    expect(core.getSnapshot().anchorValue).toBe(anchorValue);

    subscriber.mockClear();
    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("sgt1");
    expect(core.isExpanded("sgt1")).toBe(true);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(core.getSnapshot().selectedValues).toEqual(selectedValues);
    expect(core.getSnapshot().anchorValue).toBe(anchorValue);
  });

  it("does not collapse an expanded parent when ArrowLeft moves focus from its child", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null },
        { value: "branch", parent: "root" },
        { value: "leaf", parent: "branch" },
      ],
      defaultExpanded: ["root"],
      defaultActive: "branch",
    });
    const subscriber = vi.fn();
    core.subscribe(subscriber);
    subscriber.mockClear();

    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("root");
    expect(core.isExpanded("root")).toBe(true);
    expect(core.getVisibleValues()).toEqual(["root", "branch"]);
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a collapsed root or root-level leaf", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "collapsed-root", parent: null },
        { value: "child", parent: "collapsed-root" },
        { value: "root-leaf", parent: null },
      ],
      defaultActive: "collapsed-root",
    });
    const subscriber = vi.fn();
    core.subscribe(subscriber);
    subscriber.mockClear();
    const before = core.getSnapshot();

    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: false });
    expect(core.getSnapshot()).toBe(before);
    expect(subscriber).not.toHaveBeenCalled();

    core.requestFocus("root-leaf");
    subscriber.mockClear();
    const leafBefore = core.getSnapshot();
    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: false });
    expect(core.getSnapshot()).toBe(leafBefore);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it("uses temporary search expansion for ArrowLeft and ArrowRight", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null, text: "Root" },
        { value: "match", parent: "root", text: "Match" },
        { value: "child", parent: "match", text: "Child" },
        {
          value: "disabled-child",
          parent: "match",
          disabled: true,
          text: "Disabled",
        },
      ],
      defaultActive: "root",
    });
    core.setSearchQuery("match");
    expect(core.getNodeMeta("root")?.expanded).toBe(true);
    expect(core.isExpanded("root")).toBe(false);

    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("root");
    expect(core.getNodeMeta("root")?.expanded).toBe(false);
    expect(core.getVisibleValues()).toEqual(["root"]);

    expect(core.requestArrowRight()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("root");
    expect(core.getNodeMeta("root")?.expanded).toBe(true);
    core.requestFocus("match");
    expect(core.getNodeMeta("match")?.expanded).toBe(false);
    expect(core.requestArrowRight()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("match");
    expect(core.getNodeMeta("match")?.expanded).toBe(true);
    expect(core.getVisibleValues()).toEqual([
      "root",
      "match",
      "child",
      "disabled-child",
    ]);

    expect(core.requestArrowLeft()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("match");
    expect(core.getNodeMeta("match")?.expanded).toBe(false);
    expect(core.getVisibleValues()).toEqual(["root", "match"]);
  });

  it("uses ArrowRight to expand in place, then focus the first enabled child", () => {
    const core = new TreeviewCore<string>({
      selectionMode: "multiple",
      nodes: [
        { value: "root", parent: null },
        { value: "branch", parent: "root" },
        { value: "disabled", parent: "branch", disabled: true },
        { value: "child", parent: "branch" },
      ],
      defaultExpanded: ["root"],
      defaultActive: "branch",
      defaultSelected: "root",
    });
    const selected = core.getSnapshot().selectedValues;
    const anchor = core.getSnapshot().anchorValue;
    expect(core.requestArrowRight()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("branch");
    expect(core.isExpanded("branch")).toBe(true);
    expect(core.getSnapshot().selectedValues).toEqual(selected);
    expect(core.getSnapshot().anchorValue).toBe(anchor);

    expect(core.requestArrowRight()).toEqual({ ok: true, changed: true });
    expect(core.getSnapshot().active).toBe("child");
    expect(core.isExpanded("branch")).toBe(true);
    expect(core.getSnapshot().selectedValues).toEqual(selected);
    expect(core.getSnapshot().anchorValue).toBe(anchor);
  });
});
