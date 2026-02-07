<?php

namespace Affino\Popover\Laravel\View\Components;

use Illuminate\Support\Str;
use Illuminate\View\Component;
use Illuminate\View\View;

class Popover extends Component
{
    public string $popoverId;

    public string $placement;

    public string $align;

    public int $gutter;

    public int $viewportPadding;

    public string $strategy;

    public string $role;

    public bool $modal;

    public bool $closeOnEscape;

    public bool $closeOnInteractOutside;

    public bool $returnFocus;

    public bool $lockScroll;

    public bool $defaultOpen;

    public bool $pinned;

    public int $arrowSize;

    public int $arrowInset;

    public int $arrowOffset;

    public string $teleportTarget;

    public function __construct(
        ?string $popoverId = null,
        string $placement = 'bottom',
        string $align = 'center',
        int $gutter = 12,
        int $viewportPadding = 20,
        string $strategy = 'fixed',
        string $role = 'dialog',
        bool $modal = false,
        bool $closeOnEscape = true,
        bool $closeOnInteractOutside = true,
        bool $returnFocus = true,
        bool $lockScroll = false,
        bool $defaultOpen = false,
        bool $pinned = false,
        int $arrowSize = 12,
        int $arrowInset = 6,
        int $arrowOffset = 6,
        ?string $teleport = 'inline',
        ?string $teleportTarget = null
    ) {
        $resolvedTeleportTarget = $teleportTarget ?? $teleport;
        $this->popoverId = $popoverId ?: 'affino-popover-' . Str::uuid();
        $this->placement = $this->normalizePlacement($placement);
        $this->align = $this->normalizeAlign($align);
        $this->gutter = max(0, $gutter);
        $this->viewportPadding = max(0, $viewportPadding);
        $this->strategy = $this->normalizeStrategy($strategy);
        $this->role = $this->normalizeRole($role);
        $this->modal = $modal;
        $this->closeOnEscape = $closeOnEscape;
        $this->closeOnInteractOutside = $closeOnInteractOutside;
        $this->returnFocus = $returnFocus;
        $this->lockScroll = $lockScroll;
        $this->defaultOpen = $defaultOpen;
        $this->pinned = $pinned;
        $this->arrowSize = max(1, $arrowSize);
        $this->arrowInset = max(0, $arrowInset);
        $this->arrowOffset = max(0, $arrowOffset);
        $this->teleportTarget = $this->normalizeTeleportTarget($resolvedTeleportTarget);
    }

    public function render(): View
    {
        return view('popover-laravel::livewire.popover');
    }

    private function normalizePlacement(string $placement): string
    {
        $allowed = ['top', 'right', 'bottom', 'left', 'auto'];
        $candidate = strtolower($placement);

        return in_array($candidate, $allowed, true) ? $candidate : 'bottom';
    }

    private function normalizeAlign(string $align): string
    {
        $allowed = ['start', 'center', 'end', 'auto'];
        $candidate = strtolower($align);

        return in_array($candidate, $allowed, true) ? $candidate : 'center';
    }

    private function normalizeStrategy(string $strategy): string
    {
        $allowed = ['fixed', 'absolute'];
        $candidate = strtolower($strategy);

        return in_array($candidate, $allowed, true) ? $candidate : 'fixed';
    }

    private function normalizeRole(string $role): string
    {
        $allowed = ['dialog', 'menu', 'listbox', 'tree', 'grid', 'region'];
        $candidate = strtolower($role);

        return in_array($candidate, $allowed, true) ? $candidate : 'dialog';
    }

    private function normalizeTeleportTarget(?string $target): string
    {
        if ($target === null || trim($target) === '') {
            return 'inline';
        }
        $candidate = trim($target);
        if ($candidate === 'body') {
            return 'body';
        }
        if ($candidate === 'inline') {
            return 'inline';
        }

        return $candidate;
    }
}
