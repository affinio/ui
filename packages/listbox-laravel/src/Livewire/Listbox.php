<?php

namespace Affino\Listbox\Laravel\Livewire;

use Illuminate\Support\Str;
use Illuminate\View\View;
use Livewire\Component;

class Listbox extends Component
{
    public string $listboxId;

    public ?string $label = null;

    public string $placeholder = 'Select';

    public string $mode = 'single';

    public bool $loop = true;

    public ?string $model = null;

    public ?string $name = null;

    public bool $disabled = false;

    /**
     * @var array<int, array<string, mixed>>
     */
    public array $options = [];

    /**
     * @var string|array|null
     */
    public $selected = null;

    public ?string $display = null;

    public function mount(?string $listboxId = null): void
    {
        $this->listboxId = $listboxId ?: 'affino-listbox-' . Str::uuid();
    }

    public function render(): View
    {
        return view('listbox-laravel::livewire.wrapper');
    }
}
