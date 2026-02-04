<?php

namespace Affino\Dialog\Laravel\Livewire;

use Affino\Dialog\Laravel\Support\CloseStrategy;
use Affino\Dialog\Laravel\Support\OverlayKind;
use Illuminate\Support\Str;
use Livewire\Component;

class Dialog extends Component
{
    public string $dialogId;

    public bool $modal = true;

    public bool $closeOnBackdrop = true;

    public bool $closeOnEscape = true;

    public bool $lockScroll = true;

    public bool $returnFocus = true;

    public bool $pinned = false;

    public bool $defaultOpen = false;

    public string $overlayKind = OverlayKind::DIALOG;

    public string $closeStrategy = CloseStrategy::BLOCKING;

    public ?string $teleportTarget = '#affino-dialog-host';

    public ?string $pendingMessage = null;

    public ?int $maxPendingAttempts = null;

    public ?string $labelledBy = null;

    public ?string $ariaLabel = null;

    public string $surfaceRole = 'dialog';

    public ?string $descriptionId = null;

    public function mount(?string $dialogId = null, string $overlayKind = OverlayKind::DIALOG, string $closeStrategy = CloseStrategy::BLOCKING): void
    {
        $this->dialogId = $dialogId ?: 'affino-dialog-' . Str::uuid();
        $this->overlayKind = OverlayKind::normalize($overlayKind);
        $this->closeStrategy = CloseStrategy::normalize($closeStrategy);
        if ($this->teleportTarget === '') {
            $this->teleportTarget = null;
        }
    }

    public function render(): string
    {
        return view('dialog-laravel::livewire.dialog');
    }
}
