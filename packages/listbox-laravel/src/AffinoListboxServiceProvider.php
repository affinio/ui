<?php

namespace Affino\Listbox\Laravel;

use Affino\Listbox\Laravel\View\Components\Listbox;
use Affino\Listbox\Laravel\View\Components\ListboxOption;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

class AffinoListboxServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'listbox-laravel');

        Blade::component('affino-listbox', Listbox::class);
        Blade::component('affino-listbox-option', ListboxOption::class);
        Blade::component('affino-listbox.option', ListboxOption::class);

        $this->publishes([
            __DIR__ . '/../resources/views' => resource_path('views/vendor/listbox-laravel'),
        ], 'affino-listbox-laravel-views');

        $this->publishes([
            __DIR__ . '/../resources/js' => resource_path('vendor/listbox-laravel/js'),
            __DIR__ . '/../dist' => resource_path('vendor/listbox-laravel/dist'),
        ], 'affino-listbox-laravel-assets');
    }
}
