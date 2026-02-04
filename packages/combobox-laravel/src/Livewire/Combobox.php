<?php

namespace Affino\Combobox\Laravel\Livewire;

use Illuminate\Support\Str;
use Illuminate\View\View;
use Livewire\Component;

class Combobox extends Component
{
    public string $comboboxId;

    public ?string $label = null;

    public string $placeholder = 'Search dataset';

    public string $mode = 'single';

    public bool $loop = true;

    public ?string $model = null;

    public ?string $name = null;

    public bool $disabled = false;

    public bool $pinned = false;

    public bool $openOnPointerDown = true;

    /**
     * @var array<int, array<string, mixed>>
     */
    public array $options = [];

    /**
     * @var string|array|null
     */
    public $selected = null;

    public ?string $display = null;

    public function mount(?string $comboboxId = null): void
    {
        $this->comboboxId = $comboboxId ?: 'affino-combobox-' . Str::uuid();
    }

    public function render(): View
    {
        return view('combobox-laravel::livewire.wrapper');
    }
}
