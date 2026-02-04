<?php

namespace Affino\Dialog\Laravel\View\Components;

use Affino\Dialog\Laravel\Support\CloseStrategy;
use Affino\Dialog\Laravel\Support\OverlayKind;
use Illuminate\Support\Str;
use Illuminate\View\Component;
use Illuminate\View\View;

class Dialog extends Component
{
    public string $dialogId;

    public bool $modal;

    public bool $closeOnBackdrop;

    public bool $closeOnEscape;

    public bool $lockScroll;

    public bool $returnFocus;

    public bool $pinned;

    public bool $defaultOpen;

    public string $overlayKind;

    public string $closeStrategy;

    public ?string $teleportTarget;

    public ?string $pendingMessage;

    public ?int $maxPendingAttempts;

    public ?string $labelledBy;

    public ?string $ariaLabel;

    public string $surfaceRole;

    public ?string $descriptionId;

    public function __construct(
        ?string $dialogId = null,
        bool $modal = true,
        bool $closeOnBackdrop = true,
        bool $closeOnEscape = true,
        bool $lockScroll = true,
        bool $returnFocus = true,
        bool $pinned = false,
        bool $defaultOpen = false,
        string $overlayKind = OverlayKind::DIALOG,
        string $closeStrategy = CloseStrategy::BLOCKING,
        ?string $teleport = '#affino-dialog-host',
        ?string $pendingMessage = null,
        ?int $maxPendingAttempts = null,
        ?string $labelledBy = null,
        ?string $ariaLabel = null,
        string $surfaceRole = 'dialog',
        ?string $descriptionId = null,
    ) {
        $this->dialogId = $dialogId ?: 'affino-dialog-' . Str::uuid();
        $this->modal = $modal;
        $this->closeOnBackdrop = $closeOnBackdrop;
        $this->closeOnEscape = $closeOnEscape;
        $this->lockScroll = $lockScroll;
        $this->returnFocus = $returnFocus;
        $this->pinned = $pinned;
        $this->defaultOpen = $defaultOpen;
        $this->overlayKind = OverlayKind::normalize($overlayKind);
        $this->closeStrategy = CloseStrategy::normalize($closeStrategy);
        $this->teleportTarget = $teleport && $teleport !== '' ? $teleport : null;
        $this->pendingMessage = $pendingMessage;
        $this->maxPendingAttempts = $maxPendingAttempts;
        $this->labelledBy = $labelledBy;
        $this->ariaLabel = $ariaLabel;
        $this->surfaceRole = $surfaceRole;
        $this->descriptionId = $descriptionId;
    }

    public function render(): View
    {
        return view('dialog-laravel::livewire.dialog');
    }
}
